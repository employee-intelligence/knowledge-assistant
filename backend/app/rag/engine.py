from llama_index.core import VectorStoreIndex
from llama_index.core.schema import MetadataMode
from llama_index.llms.google_genai import GoogleGenAI

from app.config import settings
from app.rag.guard import is_personal_question

FALLBACK_MSG = (
    "I couldn't find that in the company documents. "
    "Please contact HR at hr@acmetech.example or +233 30 000 0000."
)
PERSONAL_MSG = (
    "I can only answer general policy questions and I can't access personal "
    "records such as leave balances, salaries or payslips. Please check the HR "
    "self-service portal on the intranet, or contact HR at hr@acmetech.example."
)

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
    def __init__(self, index: VectorStoreIndex):
        self.retriever = index.as_retriever(similarity_top_k=settings.top_k)
        self.llm = GoogleGenAI(model=settings.llm_model, api_key=settings.google_api_key)

    def ask(self, question: str) -> dict:
        if is_personal_question(question):
            return {"answer": PERSONAL_MSG, "answered": False, "confidence": 0.0, "sources": []}

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
        return {"answer": text, "answered": True, "confidence": confidence, "sources": sources}
