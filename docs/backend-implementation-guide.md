# Backend Implementation Guide

A beginner-friendly walkthrough of every backend file in `backend/app/`.
Read this alongside the code — each section explains *what* the file does and
*why* it is written that way.

---

## Big picture

```
Browser / Angular frontend
        │  HTTP + SSE (text/event-stream)
        ▼
FastAPI app (app/main.py)          ← routes, request lifecycle
  ├─ app/auth.py                   ← JWT login + roles
  ├─ app/database.py               ← SQLAlchemy models (users, sessions, history)
  ├─ app/config.py                 ← environment-driven settings
  ├─ app/schemas.py                ← Pydantic request/response shapes
  └─ app/rag/
       ├─ ingest.py                ← markdown → embeddings → vector index
       ├─ engine.py                ← retrieval + LLM streaming
       └─ guard.py                 ← blocks personal-data questions
```

A typical chat request flows like this:

1. `POST /auth/login` → server returns a JWT.
2. `POST /sessions` → returns a `session_id` (24 h expiry).
3. `POST /chat` → streams `sources`, then `token` events, then `done` (SSE).
4. `GET /history/{session_id}` → persisted Q&A rows.

---

## `app/config.py` — settings

```python
class Settings(BaseSettings): ...
settings = Settings()
```

* Uses **pydantic-settings**: every field maps to an environment variable
  (case-insensitive), e.g. `llm_model` ← `LLM_MODEL`.
* Values also fall back to a local `.env` file, and finally to the declared
  defaults.
* `nvidia_api_key` / `nvidia_embedding_api_key`: NVIDIA NIM keys. One key works
  for both chat and embeddings because the endpoint is OpenAI-compatible; the
  embedding key is separate in case they live in different projects.
* `llm_model` / `embed_model` must match model IDs on build.nvidia.com or the
  API returns 404.
* `llm_max_tokens` caps reply length; gpt-oss models emit hidden reasoning, so
  very small values can produce empty answers.
* `top_k` / `min_score`: retrieval tuning knobs (how many chunks, and the
  minimum similarity to keep).
* `database_url`: Postgres in prod; `sqlite://...` works for local dev.
* `jwt_secret_key`: signs tokens — override in production.
* `origins_list` property splits the comma-separated `ALLOWED_ORIGINS`.

## `app/database.py` — persistence

* `create_engine(..., pool_pre_ping=True)` — tests each connection before use,
  so stale Postgres connections don't cause 500s. `check_same_thread=False` is
  added only for SQLite.
* `Base` is the SQLAlchemy 2.0 declarative base; models use `Mapped[...]` +
  `mapped_column(...)` typing.

| Model | Table | Purpose |
|---|---|---|
| `User` | `users` | one row per employee; unique indexed email; `role` + `is_active` |
| `ChatSession` | `sessions` | user-scoped conversation window with `expires_at` |
| `QA` | `history` | one row per chat turn; `sources` stored as JSON |

* `create_session(db, user_id, ttl_hours=24)` — inserts a session.
* `get_valid_session(...)` — returns the session unless it is missing or
  expired. Expired rows are **deleted lazily** on access. Some Postgres drivers
  return timezone-naive datetimes, so `expires_at` is normalized to UTC before
  comparison.
* `get_db()` — FastAPI dependency yielding a `Session` and always closing it.
* `init_db()` — `Base.metadata.create_all(engine)`; idempotent, runs at
  startup, no migrations tool (Alembic) yet.

## `app/auth.py` — authentication & roles

* `hash_password` / `verify_password` — bcrypt; the salt is embedded in the
  stored hash, and `bcrypt.checkpw` does the constant-time comparison.
* `create_access_token(user_id, role)` — JWT payload: `sub` (user id), `role`,
  `exp`, `iat`; signed with HS256 and `settings.jwt_secret_key`, valid 24 h.
* `decode_access_token` — maps expired/invalid tokens to 401 with a clear
  message.
* `get_current_user` — FastAPI dependency: pulls the `Authorization: Bearer`
  header, decodes it, loads the user, and rejects missing/inactive accounts.
* `require_role(*roles)` — dependency **factory**.
  `require_role("admin", "staff")` returns a dependency that 403s users whose
  role isn't in the list. Roles used in this project: `admin`, `staff`,
  `intern`.

## `app/schemas.py` — API shapes

Pydantic models used both for validation and for OpenAPI schema generation:

* `ChatRequest` — `session_id` (8–64 chars), `question` (3–500 chars).
* `UserCreate` / `UserLogin` — validated email, password length 8–100, role
  restricted to `admin|staff|intern` via regex.
* `UserResponse`, `TokenResponse` — `from_attributes=True` lets them be built
  directly from SQLAlchemy rows.
* `Source` / `ChatResponse` / `SessionCreateResponse` / `HistoryItem` — output
  shapes shared with the frontend and history persistence.

## `app/rag/guard.py` — personal-data firewall

```python
PERSONAL_PATTERNS = [r"\bmy\b(\s+\w+){0,2}\s+(salary|pay\s?slip|...)\b", ...]
def is_personal_question(question: str) -> bool: ...
```

Regex patterns catch "my salary", "how much leave do I have left", etc. This
runs **before** any retrieval or LLM call, so personal questions never touch
the model and can never leak into an answer.

## `app/rag/ingest.py` — building the vector index

`build_index()` is called once at startup.

1. **Cache check** — if `backend/storage/` exists and is non-empty, the
   persisted index is loaded from disk via `StorageContext.from_defaults` +
   `load_index_from_storage`. Re-embedding everything on each boot would burn
   the NVIDIA free-tier quota (429s). *Delete `storage/` whenever you change
   `data/` or the embedding model.*
2. **Loading** — `SimpleDirectoryReader(settings.data_dir, required_exts=[".md"])`
   reads all markdown policy docs.
3. **Metadata** — each doc gets `policy_title` = its first `# ` heading.
4. **Chunking** — `MarkdownNodeParser()` splits docs into one node per
   markdown section. Each node gets `section` (last component of
   `header_path`, or `"Overview"`).
5. **Metadata exclusion** — file noise (`file_path`, `file_size`, …) and
   `file_name` are excluded from embedding text; file noise is also excluded
   from the LLM context, so prompts stay clean while titles/sections remain.
6. **Embedding & persist** — `VectorStoreIndex(nodes, embed_model=embed)`
   embeds with `OpenAIEmbedding` pointed at NVIDIA NIM, then
   `index.storage_context.persist(persist_dir=STORAGE_DIR)` writes the cache.

The `OpenAIEmbedding` class doesn't validate model names, so NVIDIA's
`nvidia/nemotron-3-embed-1b` works as-is.

## `app/rag/engine.py` — retrieval + generation

`Assistant` wraps retrieval and the LLM.

* `__init__` — `index.as_retriever(similarity_top_k=settings.top_k)`; the LLM
  is `OpenAILike` configured for NVIDIA:
  * `is_chat_model=True` is **required** — otherwise llama-index calls the
    legacy `/v1/completions` endpoint (404 on NVIDIA).
  * `temperature`, `max_tokens`, and `additional_kwargs={"top_p": ...}`
    (llama-index has no first-class `top_p`, so it goes through
    `additional_kwargs`).

* `ask(question)` (sync, used by tests/tuning):
  1. Personal-question guard → canned `PERSONAL_MSG`.
  2. Retrieve top-k chunks, keep those with `score >= settings.min_score`.
     If none survive → `FALLBACK_MSG` (never let the LLM guess).
  3. Build context as `(policy_title > section)\nchunk text` blocks.
  4. One strict prompt instructing the model to answer ONLY from context, with
     sentinel outputs `NOT_FOUND` / `PERSONAL`.
  5. Map sentinels to canned responses; otherwise compute `confidence` = mean
     retrieval score (a proxy, not calibrated) and attach source snippets
     (first 200 chars of each chunk).

* `ask_stream(question)` (async, used by the `/chat` endpoint):
  * Same flow but uses `retriever.aretrieve` and `llm.astream_complete`. The
    async APIs matter: the sync variants call `asyncio.run()` internally,
    which crashes inside an already-running uvicorn event loop.
  * Yields dicts: `{"event": "sources"|"token"|"done"|"error", "data": ...}`.
    `sources` is emitted first (so the UI can render citations immediately),
    then incremental `token` deltas (`chunk.delta`; `chunk.text` is
    cumulative), then `done` with confidence/answered/sources, or `error`.
  * Guard/fallback paths emit a single `token` + `done` payload.

## `app/main.py` — routes & lifecycle

* **Lifespan** — on startup: `init_db()`, `build_index()`, store an
  `Assistant` and the sorted unique `policy_title` list in a module-level
  `state` dict. Postgres remains the source of truth; `state` is per-process
  and not persisted.
* **CORS** — `CORSMiddleware` with `settings.origins_list`.
* `GET /health` — `{"status": "ok", "index_ready": ...}`.
* `GET /documents` — sorted policy titles.
* `POST /auth/register` — rejects duplicate emails, hashes the password,
  stores the user with the requested role.
* `POST /auth/login` — verifies credentials, checks `is_active`, returns a
  24 h JWT.
* `GET /auth/me` — current user.
* `POST /sessions` — any of `admin/staff/intern`; returns `session_id` +
  expiry.
* `POST /chat` —
  * Invalid/expired session or someone else's session → an SSE error stream
    (`token` with a message, then `done` with `answered: false`) instead of an
    HTTP error, so the client's streaming parser still works.
  * Otherwise streams `assistant.ask_stream(question)` events verbatim as SSE
    (`event: X\ndata: ...\n\n`). Accumulates tokens and sources; on an
    `error` event it stops without persisting. On success it writes a `QA`
    row (`answered` = not a fallback message, `confidence` currently 0.0 for
    the persisted row).
* `GET /history/{session_id}` — newest-first rows; non-admins only see their
  own history.
* `GET /admin/users`, `PATCH /admin/users/{id}/role`,
  `DELETE /admin/users/{id}` — admin-only user management; delete is a soft
  deactivate (`is_active = False`).

## `scripts/tune.py`

Standalone retrieval sanity check: `python scripts/tune.py` from `backend/`
prints, for each probe question, which sections were retrieved and their
scores. Use it to tune `TOP_K` and `MIN_SCORE` before rebuilding the index.

---

## Request/response protocol cheat-sheet

SSE stream from `POST /chat`:

```
event: sources
data: [{"document": "Leave Policy", "section": "Annual Leave", "snippet": "...", "score": 0.82}]

event: token
data: Employees are entitled to

event: token
data:  21 days of annual leave...

event: done
data: {"answered": true, "confidence": 0.81, "sources": [...]}
```

## Common gotchas

* Changed `data/` or `EMBED_MODEL`? Delete `backend/storage/`.
* Empty answers with small `LLM_MAX_TOKENS`? Raise it past the reasoning trace.
* 404 from the NIM API? Check `LLM_MODEL` / `EMBED_MODEL` IDs, and keep
  `is_chat_model=True`.
* `asyncio.run()` event-loop errors? Use the async RAG APIs (`aretrieve`,
  `astream_complete`).
* Tests against SQLite but prod on Postgres — `pool_pre_ping` + the
  `check_same_thread` tweak cover the main engine differences.
