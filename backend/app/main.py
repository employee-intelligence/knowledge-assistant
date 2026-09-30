from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import create_access_token, get_current_user, hash_password, require_role, verify_password
from app.config import settings
from app.database import QA, User, SessionLocal, create_session, get_valid_session, init_db
from app.rag.engine import Assistant
from app.rag.ingest import build_index
from app.schemas import (
    ChatRequest,
    ChatResponse,
    HistoryItem,
    SessionCreateResponse,
    TokenResponse,
    UserCreate,
    UserLogin,
    UserResponse,
)

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


@app.post("/auth/register", response_model=UserResponse)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    existing = db.scalar(select(User).where(User.email == user_data.email))
    if existing:
        return {"detail": "Email already registered"}, 400
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
        return {"detail": "Invalid email or password"}, 401
    if not user.is_active:
        return {"detail": "Account is deactivated"}, 403
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


@app.post("/chat", response_model=ChatResponse)
def chat(
    req: ChatRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "staff", "intern")),
):
    session = get_valid_session(db, req.session_id)
    if session is None or session.user_id != user.id:
        return {
            "answer": "Session expired or invalid. Please create a new session.",
            "answered": False,
            "confidence": 0.0,
            "sources": [],
        }
    result = state["assistant"].ask(req.question)
    db.add(QA(session_id=req.session_id, user_id=user.id, question=req.question, **result))
    db.commit()
    return result


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
        return {"detail": "User not found"}, 404
    new_role = role_data.get("role")
    if new_role not in ("admin", "staff", "intern"):
        return {"detail": "Invalid role"}, 400
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
        return {"detail": "User not found"}, 404
    target.is_active = False
    db.commit()
    return {"detail": "User deactivated"}
