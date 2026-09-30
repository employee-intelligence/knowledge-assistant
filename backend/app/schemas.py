from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class ChatRequest(BaseModel):
    session_id: str = Field(min_length=8, max_length=64)
    question: str = Field(min_length=3, max_length=500)


class Source(BaseModel):
    document: str
    section: str
    snippet: str
    score: float


class ChatResponse(BaseModel):
    answer: str
    answered: bool
    sources: list[Source] = []


class SessionCreateResponse(BaseModel):
    session_id: str
    expires_at: datetime


class HistoryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    question: str
    answer: str
    answered: bool
    sources: list[Source]
    created_at: datetime