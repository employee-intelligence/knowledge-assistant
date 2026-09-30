import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import QA, SessionLocal, create_session, get_valid_session, init_db
from app.rag.engine import Assistant, LlmUnavailable
from app.rag.ingest import build_index
from app.schemas import ChatRequest, ChatResponse, HistoryItem, SessionCreateResponse

logger = logging.getLogger(__name__)

state: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not settings.has_google_api_key:
        # Not fatal: the guard and retrieval-only paths still work, and health
        # reports the degraded state so it is visible before a user hits it.
        logger.error("GOOGLE_API_KEY is unset; /chat will fail to answer questions")
    init_db()
    index = build_index()  # rebuilt on every start; takes seconds
    state["assistant"] = Assistant(index)
    state["documents"] = sorted(
        {n.metadata["policy_title"] for n in index.docstore.docs.values()}
    )
    yield


app = FastAPI(title="Internal Knowledge Assistant API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Log the real cause and return JSON.

    Without this, any unhandled error reaches the browser as a bare text/plain
    500 carrying no explanation, which is what made the original Gemini outage
    so hard to diagnose from the outside.
    """
    logger.exception("unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": f"{type(exc).__name__}: {exc}"},
    )


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.get("/health")
def health():
    index_ready = "assistant" in state
    llm_configured = settings.has_google_api_key
    return {
        "status": "ok" if index_ready and llm_configured else "degraded",
        "index_ready": index_ready,
        "llm_configured": llm_configured,
        "llm_model": settings.llm_model,
    }


@app.get("/documents")
def documents():
    return state["documents"]


@app.post("/sessions", response_model=SessionCreateResponse)
def create_session_endpoint(db: Session = Depends(get_db)):
    session = create_session(db)
    return {"session_id": session.id, "expires_at": session.expires_at}


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest, db: Session = Depends(get_db)):
    session = get_valid_session(db, req.session_id)
    if session is None:
        return {
            "answer": "Session expired or invalid. Please create a new session.",
            "answered": False,
            "sources": [],
        }

    try:
        result = state["assistant"].ask(req.question)
    except LlmUnavailable as exc:
        # Upstream Gemini is down or the key is rejected. 503 tells the client
        # this is worth retrying, and no history row is written for a turn that
        # never produced an answer.
        logger.error("question not answered: %s", exc.reason)
        raise HTTPException(status_code=503, detail="The assistant is temporarily unavailable. Please try again.")

    db.add(QA(session_id=req.session_id, question=req.question, **result))
    db.commit()
    return result


@app.get("/history/{session_id}", response_model=list[HistoryItem])
def history(session_id: str, db: Session = Depends(get_db)):
    return db.scalars(
        select(QA).where(QA.session_id == session_id).order_by(QA.created_at.desc())
    ).all()