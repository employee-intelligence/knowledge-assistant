import logging
import time

from google.genai.errors import APIError, ClientError, ServerError
from llama_index.core import VectorStoreIndex
from llama_index.core.schema import MetadataMode
from llama_index.llms.google_genai import GoogleGenAI

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
    """No configured Gemini model could produce an answer.

    Carries the upstream reason so the route can log it and tell an operator what
    actually went wrong, rather than the caller seeing an opaque 500.
    """

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


class Assistant:
    def __init__(self, index: VectorStoreIndex):
        self.retriever = index.as_retriever(similarity_top_k=settings.top_k)
        self._client: GoogleGenAI | None = None

    def _complete(self, prompt: str) -> tuple[str, str]:
        """Answer via the first model in the chain that works, with retries.

        Upstream Gemini calls fail in two very different ways and the difference
        decides what to do next: a 5xx/UNAVAILABLE is load that usually clears, so
        it is worth waiting on, while a 4xx means the model is retired or the key
        is rejected and retrying the same call can only fail again.
        """
        failures: list[str] = []

        for model in settings.llm_models:
            try:
                client = GoogleGenAI(model=model, api_key=settings.google_api_key)
            except Exception as exc:
                failures.append(f"{model}: client init failed: {exc}")
                continue

            for attempt in range(1, settings.llm_max_attempts + 1):
                try:
                    return client.complete(prompt).text.strip(), model
                except ServerError as exc:
                    failures.append(f"{model} attempt {attempt}: upstream {exc}")
                    if attempt < settings.llm_max_attempts:
                        delay = settings.llm_retry_base_seconds * (2 ** (attempt - 1))
                        logger.warning(
                            "%s unavailable (attempt %s/%s), retrying in %.1fs",
                            model, attempt, settings.llm_max_attempts, delay,
                        )
                        time.sleep(delay)
                except ClientError as exc:
                    # 404: model retired. 403: key rejected. Neither gets better
                    # by asking again, so move straight to the next model.
                    failures.append(f"{model}: rejected by API: {exc}")
                    break
                except APIError as exc:
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
        """Generates a short title for a conversation from its first question."""
        if not self._client:
            return truncate_title(question)

        title_prompt = (
            "Generate a short, descriptive title (max 50 chars) for a conversation "
            "starting with this question. No quotes, no punctuation at the end.\n\n"
            f"Question: {question}\nTitle:"
        )
        try:
            # Try the llama_index GoogleGenAI interface first
            if hasattr(self._client, 'complete'):
                response = self._client.complete(title_prompt)
                title = response.text.strip().strip('"\'')
                return truncate_title(title)
            # Fallback to OpenAI-compatible interface (used in tests)
            elif hasattr(self._client, 'chat') and hasattr(self._client.chat, 'completions'):
                response = self._client.chat.completions.create(
                    model="title-generator",
                    messages=[{"role": "user", "content": title_prompt}],
                    max_tokens=TITLE_MAX_TOKENS,
                )
                title = response.choices[0].message.content.strip().strip('"\'').rstrip('.')
                return truncate_title(title)
            else:
                return truncate_title(question)
        except Exception:
            return truncate_title(question)
