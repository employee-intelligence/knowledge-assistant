# RBAC Implementation Guide

## Current State

The application has **no authentication or authorization**. All endpoints are fully open:

| Endpoint | Current Access |
|----------|---------------|
| `GET /health` | Public |
| `GET /documents` | Public |
| `POST /sessions` | Public |
| `POST /chat` | Public |
| `GET /history/{session_id}` | Public |

There is no user model, no roles, and no way to distinguish between Admin, Staff, and Intern users.

---

## Recommended Approach

### Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Client    │────▶│  Auth Layer  │────▶│  RBAC Guards    │
│  (Frontend) │◀────│  (JWT/OAuth) │◀────│  (Dependencies) │
└─────────────┘     └──────────────┘     └─────────────────┘
                                                │
                                                ▼
                                        ┌───────────────┐
                                        │   Endpoints   │
                                        │  /chat        │
                                        │  /history     │
                                        │  /admin/*     │
                                        └───────────────┘
```

### Technology Stack

| Component | Recommendation | Rationale |
|-----------|---------------|-----------|
| Authentication | JWT (JSON Web Tokens) | Stateless, scalable, works with FastAPI |
| Password Hashing | bcrypt | Industry standard, secure |
| Token Storage | HTTP-only cookies or Authorization header | Secure token transport |
| Role Enforcement | FastAPI Dependencies | Clean, declarative, per-endpoint |

---

## Required Database Changes

### New Table: `users`

```python
class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # UUID
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(20), default="staff")  # admin | staff | intern
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
```

### Modified Table: `sessions`

Add a `user_id` column to link chat sessions to authenticated users:

```python
class ChatSession(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
```

### Modified Table: `history` (QA)

Add a `user_id` column to link chat history to users:

```python
class QA(Base):
    __tablename__ = "history"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[str] = mapped_column(String(64), index=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id"), index=True)
    question: Mapped[str] = mapped_column(Text)
    answer: Mapped[str] = mapped_column(Text)
    answered: Mapped[bool] = mapped_column(Boolean)
    confidence: Mapped[float] = mapped_column(default=0.0)
    sources: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
```

---

## Required API Changes

### New Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/register` | Create a new user account |
| `POST` | `/auth/login` | Authenticate and return JWT |
| `POST` | `/auth/logout` | Invalidate token |
| `GET` | `/auth/me` | Get current user profile |
| `GET` | `/admin/users` | List all users (Admin only) |
| `PATCH` | `/admin/users/{id}/role` | Change user role (Admin only) |
| `DELETE` | `/admin/users/{id}` | Deactivate user (Admin only) |

### Modified Endpoints

| Endpoint | Change |
|----------|--------|
| `POST /sessions` | Requires authentication; links session to user |
| `POST /chat` | Requires authentication; validates user role permissions |
| `GET /history/{session_id}` | Users can only access their own history; Admins can access all |

---

## Permission Matrix

| Capability | Admin | Staff | Intern |
|------------|:-----:|:-----:|:------:|
| Ask questions (chat) | ✅ | ✅ | ✅ |
| View own chat history | ✅ | ✅ | ✅ |
| View all users' history | ✅ | ❌ | ❌ |
| List all documents | ✅ | ✅ | ✅ |
| Upload/manage documents | ✅ | ❌ | ❌ |
| Manage user roles | ✅ | ❌ | ❌ |
| Deactivate users | ✅ | ❌ | ❌ |
| View admin dashboard | ✅ | ❌ | ❌ |
| Access HR/payroll data | ✅ | ❌ | ❌ |
| Export chat history | ✅ | ❌ | ❌ |

---

## Implementation Roadmap

### Phase 1: Authentication Foundation
1. Add `User` model and database migration
2. Implement password hashing with bcrypt
3. Create JWT token generation and validation
4. Add `/auth/register` and `/auth/login` endpoints
5. Create `get_current_user` dependency

### Phase 2: Role-Based Authorization
1. Create `require_role` dependency factory
2. Add role field to user registration
3. Protect existing endpoints with role checks
4. Add admin-only endpoints for user management

### Phase 3: Session & History Linking
1. Add `user_id` to `ChatSession` and `QA` models
2. Update session creation to require authentication
3. Update history queries to filter by user
4. Add admin override for cross-user history access

### Phase 4: Frontend Integration
1. Add login/register forms
2. Store JWT in HTTP-only cookies
3. Add role-based UI rendering
4. Handle 401/403 responses gracefully

---

## Example Implementation

### Auth Dependency

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    token = credentials.credentials
    payload = decode_jwt(token)  # Your JWT decode logic
    user = db.get(User, payload["sub"])
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user

def require_role(*allowed_roles: str):
    def role_checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Role '{user.role}' is not authorized for this action",
            )
        return user
    return role_checker
```

### Protected Endpoint Example

```python
@app.post("/chat", response_model=ChatResponse)
def chat(
    req: ChatRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "staff", "intern")),
):
    # ... existing chat logic
    pass

@app.get("/admin/users")
def list_users(
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    return db.scalars(select(User)).all()
```

---

## Security Considerations

1. **Password Security**: Always hash passwords with bcrypt; never store plaintext
2. **Token Expiry**: JWTs should expire (e.g., 24 hours for access tokens)
3. **HTTPS Only**: Tokens should only be transmitted over HTTPS in production
4. **Rate Limiting**: Apply rate limiting to auth endpoints to prevent brute force
5. **Audit Logging**: Log all authentication and authorization events
6. **Role Escalation Prevention**: Only Admins can change roles, and only to lower-privilege roles
