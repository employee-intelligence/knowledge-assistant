from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import QA, SessionLocal, create_session, get_valid_session, init_db
from app.rag.engine import Assistant
from app.rag.ingest import build_index
from app.schemas import ChatRequest, ChatResponse, HistoryItem, SessionCreateResponse

state: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
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


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.get("/health")
def health():
    return {"status": "ok", "index_ready": "assistant" in state}


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
    result = state["assistant"].ask(req.question)
    db.add(QA(session_id=req.session_id, question=req.question, **result))
    db.commit()
    return result


@app.get("/history/{session_id}", response_model=list[HistoryItem])
def history(session_id: str, db: Session = Depends(get_db)):
    return db.scalars(
        select(QA).where(QA.session_id == session_id).order_by(QA.created_at.desc())
    ).all()