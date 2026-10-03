from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker
from app.config import settings

# sqlite (dev) needs check_same_thread disabled; Postgres (prod) does not.
# pool_pre_ping recycles dropped connections before they cause 500s.
_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False)


class Base(DeclarativeBase):
    pass


class User(Base):
    # One row per registered employee; email is unique and indexed for login lookups.
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(20), default="staff")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class ChatSession(Base):
    # A chat session pairs a user with a time-limited conversation window.
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class QA(Base):
    # One row per answered/refused chat turn; sources stored as JSON for history display.
    __tablename__ = "history"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[str] = mapped_column(String(64), index=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id"), index=True)
    question: Mapped[str] = mapped_column(Text)
    answer: Mapped[str] = mapped_column(Text)
    answered: Mapped[bool] = mapped_column(Boolean)
    confidence: Mapped[float] = mapped_column(default=0.0)
    sources: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


def create_session(db: Session, user_id: str, ttl_hours: int = 24) -> ChatSession:
    session = ChatSession(
        id=uuid4().hex,
        user_id=user_id,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=ttl_hours),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_valid_session(db: Session, session_id: str) -> ChatSession | None:
    session = db.get(ChatSession, session_id)
    if session is None:
        return None
    # Postgres returns timezone-naive datetimes even for DateTime(timezone=True)
    # columns on some drivers — normalize before comparing.
    expires_at = session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        # Expired sessions are deleted lazily (on access) to keep the table clean.
        db.delete(session)
        db.commit()
        return None
    return session


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    # Creates all tables on startup if they don't exist yet (idempotent).
    Base.metadata.create_all(engine)
