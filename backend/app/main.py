import json
from contextlib import asynccontextmanager
from uuid import uuid4

# Knowledge Assistant API — FastAPI entrypoint.
#
# High-level flow per request:
#   POST /auth/login        -> JWT
#   POST /sessions          -> chat session id
#   POST /chat              -> SSE stream: "sources" event, then "token" events, then "done"
#   GET  /history/{sid}     -> persisted Q&A rows
#
# The llama-index VectorStoreIndex is built once at startup (see lifespan) and
# shared read-only across requests; all conversation state lives in Postgres.

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import create_access_token, get_current_user, hash_password, require_role, verify_password
from app.config import settings
from app.database import QA, User, SessionLocal, create_session, get_valid_session, init_db
from app.rag.engine import Assistant
from app.rag.ingest import build_index
from app.schemas import (
    ChatRequest,
    HistoryItem,
    SessionCreateResponse,
    TokenResponse,
    UserCreate,
    UserLogin,
    UserResponse,
)

# Shared per-process state (see lifespan). Not persisted — Postgres is the source of truth.
state: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    index = build_index()  # loaded from disk cache when available; delete storage/ to rebuild
    # In-memory process state: Assistant wraps retrieval+LLM, documents feeds /documents.
    state["assistant"] = Assistant(index)
    # Unique policy titles across all docstore nodes, sorted for stable UI output.
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


@app.post("/auth/register", response_model=UserResponse)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    existing = db.scalar(select(User).where(User.email == user_data.email))
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        id=uuid4().hex,
        email=user_data.email,
        hashed_password=hash_password(user_data.password),
        role=user_data.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.post("/auth/login", response_model=TokenResponse)
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == credentials.email))
    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")
    token = create_access_token(user.id, user.role)
    return TokenResponse(access_token=token, expires_in=86400)


@app.get("/auth/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user)):
    return user


@app.post("/sessions", response_model=SessionCreateResponse)
def create_session_endpoint(
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "staff", "intern")),
):
    session = create_session(db, user.id)
    return {"session_id": session.id, "expires_at": session.expires_at}


@app.post("/chat")
def chat(
    req: ChatRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "staff", "intern")),
):
    session = get_valid_session(db, req.session_id)
    if session is None or session.user_id != user.id:
        # Stream protocol: newline-delimited SSE. First an error token, then
        # done — client must handle this gracefully (no answer in history flow).
        def error_stream():
            yield f"event: token\ndata: Session expired or invalid. Please create a new session.\n\n"
            yield f"event: done\ndata: {json.dumps({'answered': False, 'confidence': 0.0, 'sources': []})}\n\n"
        return StreamingResponse(error_stream(), media_type="text/event-stream")

    assistant = state["assistant"]

    # Most recent QA row in this session → feed its source topics to the
    # conversational-reply prompt so follow-ups can suggest related topics
    # without re-running retrieval.
    recent_sources = None
    last_qa = db.scalars(
        select(QA)
        .where(QA.session_id == req.session_id)
        .order_by(QA.created_at.desc())
        .limit(1)
    ).first()
    if last_qa and last_qa.sources:
        srcs = last_qa.sources if isinstance(last_qa.sources, list) else json.loads(last_qa.sources)
        recent_sources = [f"{s.get('document')} > {s.get('section')}" for s in srcs]

    async def event_stream():
        full_answer = []
        sources = []
        failed = False

        # ask_stream is an async generator built on the async llama-index
        # APIs, so it runs directly on this event loop — no threads needed.
        async for event in assistant.ask_stream(req.question, recent_sources=recent_sources):
            if event["event"] == "sources":
                sources = json.loads(event["data"])
            elif event["event"] == "token":
                full_answer.append(event["data"])
            elif event["event"] == "error":
                failed = True
            yield f"event: {event['event']}\ndata: {event['data']}\n\n"

        if failed:
            return  # don't persist partial answers from failed generations

        # Persist the completed QA pair
        answer_text = "".join(full_answer).strip()
        result = {
            "answer": answer_text,
            "answered": not answer_text.startswith(("I couldn't find", "I can only answer")),
            "confidence": 0.0,
            "sources": sources,
        }
        db.add(QA(session_id=req.session_id, user_id=user.id, question=req.question, **result))
        db.commit()

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/history/{session_id}", response_model=list[HistoryItem])
def history(
    session_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "staff", "intern")),
):
    query = select(QA).where(QA.session_id == session_id)
    if user.role != "admin":
        query = query.where(QA.user_id == user.id)
    return db.scalars(query.order_by(QA.created_at.desc())).all()


@app.get("/admin/users", response_model=list[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    return db.scalars(select(User)).all()


@app.patch("/admin/users/{user_id}/role", response_model=UserResponse)
def update_user_role(
    user_id: str,
    role_data: dict,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    new_role = role_data.get("role")
    if new_role not in ("admin", "staff", "intern"):
        raise HTTPException(status_code=400, detail="Invalid role")
    target.role = new_role
    db.commit()
    db.refresh(target)
    return target


@app.delete("/admin/users/{user_id}")
def deactivate_user(
    user_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target.is_active = False
    db.commit()
    return {"detail": "User deactivated"}
