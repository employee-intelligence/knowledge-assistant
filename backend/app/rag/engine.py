from llama_index.core import VectorStoreIndex
from llama_index.core.schema import MetadataMode
from llama_index.llms.openai_like import OpenAILike

from app.config import settings
from app.rag.guard import is_personal_question
import json

# Standard responses used when the question can't or shouldn't be answered.
FALLBACK_MSG = (
    "I couldn't find that in the company documents. "
    "Please contact HR at hr@acmetech.example or +233 30 000 0000."
)
PERSONAL_MSG = (
    "I can only answer general policy questions and I can't access personal "
    "records such as leave balances, salaries or payslips. Please check the HR "
    "self-service portal on the intranet, or contact HR at hr@acmetech.example."
)

# This prompt forces the LLM to answer ONLY from retrieved context. The special
# sentinel replies NOT_FOUND / PERSONAL let us distinguish "no answer found" and
# "personal data request" without needing structured output parsing.
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


class Assistant:
    """Facade over retrieval + generation.

    Flow: personal-question guard -> vector retrieval (top_k, filtered by
    min_score) -> single strict-context prompt -> sentinel post-processing
    (NOT_FOUND / PERSONAL mapped to canned responses).
    """

    def __init__(self, index: VectorStoreIndex):
        # similarity_top_k = how many chunks we retrieve per question.
        self.retriever = index.as_retriever(similarity_top_k=settings.top_k)
        # Context window note: the retriever feeds full chunks, so chunks must
        # stay small enough to fit in settings.llm_max_tokens together with the prompt.
        self.llm = OpenAILike(
            model=settings.llm_model,
            api_key=settings.nvidia_api_key,
            api_base=settings.nvidia_base_url,
            temperature=settings.llm_temperature,
            max_tokens=settings.llm_max_tokens,
            # llama-index's OpenAI constructor has no explicit top_p parameter,
            # so it must travel through additional_kwargs to reach the API payload.
            additional_kwargs={"top_p": settings.llm_top_p},
            # Required: without this, llama-index treats the model as a legacy
            # text-completion model and calls /v1/completions (404 on NVIDIA).
            is_chat_model=True,
        )

    def ask(self, question: str) -> dict:
        if is_personal_question(question):
            return {"answer": PERSONAL_MSG, "answered": False, "confidence": 0.0, "sources": []}

        # Keep only chunks above the similarity threshold; if none qualify,
        # answer with the canned fallback instead of letting the LLM guess.
        nodes = [n for n in self.retriever.retrieve(question)
                 if (n.score or 0) >= settings.min_score]
        if not nodes:
            return {"answer": FALLBACK_MSG, "answered": False, "confidence": 0.0, "sources": []}

        context = "\n\n".join(
            f"({n.metadata['policy_title']} > {n.metadata['section']})\n"
            f"{n.get_content(metadata_mode=MetadataMode.NONE)}"
            for n in nodes
        )
        text = self.llm.complete(
            PROMPT.format(context=context, question=question)
        ).text.strip()

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
        # Confidence = mean similarity of the retrieved chunks (proxy, not a calibrated probability).
        return {"answer": text, "answered": True, "confidence": confidence, "sources": sources}

    async def ask_stream(self, question: str):
        """Stream the LLM response as SSE events (async generator).

        Uses the async llama-index APIs (aretrieve / astream_complete). The sync
        variants call asyncio.run() internally, which raises
        "asyncio.run() cannot be called from a running event loop" when invoked
        from a server that already has an event loop.

        Yields dicts with 'event' and 'data' keys:
          - event "sources"  → data: JSON list of source dicts
          - event "token"    → data: plain text chunk (delta, append on client)
          - event "done"     → data: JSON with confidence, answered, sources
          - event "error"    → data: error message string
        """
        if is_personal_question(question):
            yield {"event": "token", "data": PERSONAL_MSG}
            yield {"event": "done", "data": json.dumps({"answered": False, "confidence": 0.0, "sources": []})}
            return

        nodes = [n for n in await self.retriever.aretrieve(question)
                 if (n.score or 0) >= settings.min_score]
        if not nodes:
            yield {"event": "token", "data": FALLBACK_MSG}
            yield {"event": "done", "data": json.dumps({"answered": False, "confidence": 0.0, "sources": []})}
            return

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

        # Send sources first so the UI can render them immediately
        yield {"event": "sources", "data": json.dumps(sources)}

        context = "\n\n".join(
            f"({n.metadata['policy_title']} > {n.metadata['section']})\n"
            f"{n.get_content(metadata_mode=MetadataMode.NONE)}"
            for n in nodes
        )
        prompt = PROMPT.format(context=context, question=question)

        full_text = []
        try:
            stream = await self.llm.astream_complete(prompt)
            async for chunk in stream:
                token = chunk.delta  # incremental text; chunk.text is cumulative
                if not token:
                    continue
                full_text.append(token)
                yield {"event": "token", "data": token}
        except Exception as e:
            yield {"event": "error", "data": str(e)}
            return

        text = "".join(full_text).strip()

        if "PERSONAL" == text:
            yield {"event": "token", "data": PERSONAL_MSG}
            yield {"event": "done", "data": json.dumps({"answered": False, "confidence": 0.0, "sources": []})}
            return
        if "NOT_FOUND" in text:
            yield {"event": "token", "data": FALLBACK_MSG}
            yield {"event": "done", "data": json.dumps({"answered": False, "confidence": 0.0, "sources": []})}
            return

        yield {"event": "done", "data": json.dumps({"answered": True, "confidence": confidence, "sources": sources})}
