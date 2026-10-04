import logging
import time

from llama_index.core import VectorStoreIndex
from llama_index.core.schema import MetadataMode
from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AuthenticationError,
    BadRequestError,
    InternalServerError,
    NotFoundError,
    OpenAI,
    PermissionDeniedError,
    RateLimitError,
)

from app.config import settings
from app.rag.guard import is_personal_question

logger = logging.getLogger(__name__)

FALLBACK_MSG = (
    "I couldn't find that in the company documents. "
    "Please contact HR at hr@acmetech.example or +233 30 000 0000."
)
PERSONAL_MSG = (
    "I can only answer general policy questions and I can't access personal "
    "records such as leave balances, salaries or payslips. Please check the HR "
    "self-service portal on the intranet, or contact HR at hr@acmetech.example."
)

TITLE_MAX_TOKENS = 64


def truncate_title(title: str) -> str:
    """Truncates a title to 50 characters at a word boundary."""
    if len(title) <= 50:
        return title
    truncated = title[:50]
    # Find the last space to avoid cutting a word in half
    last_space = truncated.rfind(' ')
    if last_space > 0:
        truncated = truncated[:last_space]
    return truncated.rstrip(' .,;:')


PROMPT = """You are the Internal Knowledge Assistant for Acme Technologies.
Answer the question using ONLY the context below. Be concise, and use numbered
steps when the source describes a process.

Rules:
- If the context does not contain the answer, reply with exactly: NOT_FOUND
- If the question asks about the asker's own personal records (their own leave
  balance, salary, payslip, appraisal), reply with exactly: PERSONAL
- Never use outside knowledge.

Context:
{context}

Question: {question}
Answer:"""


class LlmUnavailable(Exception):
    """No configured NVIDIA model could produce an answer.

    Carries the upstream reason so the route can log it and tell an operator what
    actually went wrong, rather than the caller seeing an opaque 500.
    """

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


class Assistant:
    def __init__(self, index: VectorStoreIndex):
        self.retriever = index.as_retriever(similarity_top_k=settings.top_k)
        self._client: OpenAI | None = None

    def _nvidia_client(self) -> OpenAI:
        """The OpenAI-compatible client for NVIDIA's API, built once."""
        if self._client is None:
            self._client = OpenAI(
                api_key=settings.nvidia_api_key,
                base_url=settings.nvidia_base_url,
            )
        return self._client

    def _complete(self, prompt: str) -> tuple[str, str]:
        """Answer via the first model in the chain that works, with retries.

        NVIDIA serves an OpenAI-compatible API, so the OpenAI SDK talks to it
        with nothing changed but the base URL. Upstream calls fail in two very
        different ways and the difference decides what to do next: a 5xx or a
        rate limit is load that usually clears, so it is worth waiting on, while
        a 4xx means the model is retired or the key is rejected and retrying the
        same call can only fail again.
        """
        failures: list[str] = []

        if not settings.has_nvidia_api_key:
            raise LlmUnavailable("NVIDIA_API_KEY is unset")

        try:
            client = self._nvidia_client()
        except Exception as exc:
            raise LlmUnavailable(f"client init failed: {exc}") from exc

        for model in settings.llm_models:
            for attempt in range(1, settings.llm_max_attempts + 1):
                try:
                    completion = client.chat.completions.create(
                        model=model,
                        messages=[{"role": "user", "content": prompt}],
                        temperature=settings.llm_temperature,
                        top_p=settings.llm_top_p,
                        max_tokens=settings.llm_max_tokens,
                    )
                    text = (completion.choices[0].message.content or "").strip()
                    if not text:
                        failures.append(f"{model} attempt {attempt}: model returned no content")
                        continue
                    return text, model
                except (InternalServerError, RateLimitError, APIConnectionError, APITimeoutError) as exc:
                    failures.append(f"{model} attempt {attempt}: upstream {exc}")
                    if attempt < settings.llm_max_attempts:
                        delay = settings.llm_retry_base_seconds * (2 ** (attempt - 1))
                        logger.warning(
                            "%s unavailable (attempt %s/%s), retrying in %.1fs",
                            model, attempt, settings.llm_max_attempts, delay,
                        )
                        time.sleep(delay)
                except (AuthenticationError, PermissionDeniedError, NotFoundError, BadRequestError) as exc:
                    # 404: model retired. 403: key rejected. Neither gets better
                    # by asking again, so move straight to the next model.
                    failures.append(f"{model}: rejected by API: {exc}")
                    break
                except APIStatusError as exc:
                    failures.append(f"{model} attempt {attempt}: {exc}")
                    break

        reason = "; ".join(failures) or "no usable model configured"
        logger.error("every model in the chain failed: %s", reason)
        raise LlmUnavailable(reason)

    def ask(self, question: str) -> dict:
        if is_personal_question(question):
            return {"answer": PERSONAL_MSG, "answered": False, "confidence": 0.0, "sources": []}

        try:
            retrieved = self.retriever.retrieve(question)
        except APIError as exc:
            # Embedding the query is a Gemini call too, and fails the same way.
            raise LlmUnavailable(f"embedding/retrieval failed: {exc}") from exc

        nodes = [n for n in retrieved if (n.score or 0) >= settings.min_score]
        if not nodes:
            return {"answer": FALLBACK_MSG, "answered": False, "confidence": 0.0, "sources": []}

        context = "\n\n".join(
            f"({n.metadata['policy_title']} > {n.metadata['section']})\n"
            f"{n.get_content(metadata_mode=MetadataMode.NONE)}"
            for n in nodes
        )
        text, model = self._complete(PROMPT.format(context=context, question=question))
        logger.info("answered %r via %s", question, model)

        if "PERSONAL" == text:
            return {"answer": PERSONAL_MSG, "answered": False, "confidence": 0.0, "sources": []}
        if "NOT_FOUND" in text:
            return {"answer": FALLBACK_MSG, "answered": False, "confidence": 0.0, "sources": []}

        sources = [
            {
                "document": n.metadata["policy_title"],
                "section": n.metadata["section"],
                "snippet": n.get_content(metadata_mode=MetadataMode.NONE)[:200],
                "score": round(float(n.score or 0), 3),
            }
            for n in nodes
        ]
        confidence = round(sum(float(n.score or 0) for n in nodes) / len(nodes), 3)
        return {"answer": text, "answered": True, "confidence": confidence, "sources": sources}

    def generate_title(self, question: str) -> str:
        """Names a session after its first question, truncated to fit the list."""
        return truncate_title(question)
