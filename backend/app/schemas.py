from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, EmailStr


class ChatRequest(BaseModel):
    session_id: str = Field(min_length=8, max_length=64)
    question: str = Field(min_length=3, max_length=500)


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=100)
    role: str = Field(default="staff", pattern="^(admin|staff|intern)$")


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    role: str
    is_active: bool
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class Source(BaseModel):
    document: str
    section: str
    snippet: str
    score: float


class ChatResponse(BaseModel):
    answer: str
    answered: bool
    confidence: float = 0.0
    sources: list[Source] = []


class SessionCreateResponse(BaseModel):
    session_id: str
    expires_at: datetime


class HistoryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    question: str
    answer: str
    answered: bool
    confidence: float = 0.0
    sources: list[Source]
    created_at: datetime
