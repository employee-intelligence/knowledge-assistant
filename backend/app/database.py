from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

from app.config import settings

_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False)


class Base(DeclarativeBase):
    pass


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    client_id: Mapped[str] = mapped_column(String(64), index=True)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="Message.created_at",
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    conversation_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text)
    sources: Mapped[list | None] = mapped_column(JSON, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    conversation: Mapped["Conversation"] = relationship(back_populates="messages")


def create_conversation(db: SessionLocal, client_id: str) -> Conversation:
    conversation = Conversation(id=uuid4().hex, client_id=client_id)
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation


def get_owned_conversation(
    db: SessionLocal, conversation_id: str, client_id: str
) -> Conversation | None:
    """The conversation, but only if it belongs to the calling client.

    Conversations carry no shared secret, so ownership is the whole boundary:
    a client that knows an id it does not own is answered exactly like a client
    that guessed an id that never existed, instead of being told it exists.
    """
    conversation = db.get(Conversation, conversation_id)
    if conversation is None or conversation.client_id != client_id:
        return None
    return conversation


def touch(db: SessionLocal, conversation: Conversation) -> None:
    conversation.updated_at = datetime.now(timezone.utc)
    db.commit()


def init_db() -> None:
    Base.metadata.create_all(engine)