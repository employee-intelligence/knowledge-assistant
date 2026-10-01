# Knowledge Assistant Backend

Internal knowledge assistant API for Acme Technologies. Answers employee questions using RAG (Retrieval-Augmented Generation) over company policy documents, powered by NVIDIA NIM.

## Tech Stack

- **Framework:** FastAPI
- **LLM:** gpt-oss on NVIDIA NIM (`openai/gpt-oss-20b`, via the OpenAI-compatible API)
- **Embeddings:** NVIDIA `nvidia/nemotron-3-embed-1b`, a retrieval/QA model rather than a general-purpose embedder
- **RAG Pipeline:** LlamaIndex
- **Database:** PostgreSQL (SQLAlchemy ORM)
- **Deployment:** Docker + Render

## Project Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py            # FastAPI app & routes
│   ├── config.py          # Settings (env-based)
│   ├── database.py        # SQLAlchemy models & session
│   ├── schemas.py         # Pydantic request/response models
│   └── rag/
│       ├── __init__.py
│       ├── engine.py      # RAG assistant (retrieve + generate)
│       ├── guard.py       # Personal-question filter
│       └── ingest.py      # Document loading & indexing
├── data/                  # Policy markdown documents (13 files)
│   ├── 00-README.md
│   ├── 01-company-overview.md
│   └── ...
├── scripts/
│   └── tune.py            # Tuning script
├── Dockerfile
├── requirements.txt
├── .env.example
└── README.md
```

## Local Setup

### Prerequisites

- Python 3.12+
- PostgreSQL 14+ (or use Docker below)
- Two NVIDIA API keys from [build.nvidia.com](https://build.nvidia.com): one for
  generation, one for retrieval

### Option 1: Run with Docker (Recommended)

```bash
# Build and run
docker build -t knowledge-assistant .
docker run -p 8000:8000 \
  -e NVIDIA_API_KEY=your_generation_key \
  -e NVIDIA_EMBEDDING_API_KEY=your_retrieval_key \
  -e DATABASE_URL=postgresql://user:password@host:5432/knowledge_assistant \
  knowledge-assistant
```

### Option 2: Run Locally

```bash
# 1. Create virtual environment
python -m venv .venv
source .venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your NVIDIA keys (generation + retrieval) and database URL

# 4. Run the app
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NVIDIA_API_KEY` | Yes | — | NVIDIA key used for generation |
| `NVIDIA_EMBEDDING_API_KEY` | Yes | — | Separate NVIDIA key used for retrieval |
| `NVIDIA_BASE_URL` | No | `https://integrate.api.nvidia.com/v1` | OpenAI-compatible NVIDIA endpoint |
| `LLM_MODEL` | No | `openai/gpt-oss-20b` | Model used for generation |
| `LLM_MAX_TOKENS` | No | `1024` | Output token ceiling |
| `LLM_TEMPERATURE` | No | `0.5` | Sampling temperature |
| `LLM_TOP_P` | No | `1` | Nucleus sampling cutoff |
| `LLM_MAX_ATTEMPTS` | No | `3` | Attempts before a 429/5xx is given up on |
| `EMBED_MODEL` | No | `nvidia/nemotron-3-embed-1b` | Model used for retrieval embeddings |
| `DATABASE_URL` | No | `postgresql://user:password@localhost:5432/knowledge_assistant` | PostgreSQL connection string |
| `ALLOWED_ORIGINS` | No | `*` | Comma-separated CORS origins |
| `TOP_K` | No | `4` | Number of documents to retrieve |
| `MIN_SCORE` | No | `0.40` | Minimum similarity score threshold |
| `DATA_DIR` | No | `data` | Path to policy documents |

`MIN_SCORE` is tied to `EMBED_MODEL`: different embedding models produce different
score ranges, so after changing it check the numbers with

```bash
PYTHONPATH=. python scripts/tune.py
```

A threshold that is too high makes every question look like "not found" with no
error anywhere, which is the most likely thing to break when swapping providers.

`EMBED_MODEL` also has to exist in NVIDIA's catalog. Several plausible choices
(`nvidia/llama-3.2-nv-embedqa-1b-v2`, `nvidia/nv-embedqa-e5-v5`,
`nvidia/nv-embed-v1`, `baai/bge-m3`) now answer `410 Gone`, and a retired model
fails the same silent way as a mistuned threshold: startup errors out.

Failures are reported rather than swallowed: a 429 or 5xx is retried with
exponential backoff, and once the attempts are used up `/chat` answers 503 and
writes no history row. `/health` reports `degraded` when the generation key is
missing and `embedding_configured` for the retrieval key.

## API Endpoints

### Health Check

```bash
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "index_ready": true,
  "llm_configured": true,
  "embedding_configured": true,
  "llm_model": "openai/gpt-oss-20b"
}
```

---

### List Documents

```bash
GET /documents
```

**Response:**
```json
[
  "Company Overview",
  "Technical Departments and Tech Stack",
  "Working Hours Policy",
  "Leave Policy",
  ...
]
```

---

### Ask a Question

```bash
POST /chat
Content-Type: application/json

{
  "session_id": "user-session-123",
  "question": "What is the annual leave policy?"
}
```

**Response (success):**
```json
{
  "answer": "Employees are entitled to 21 days of annual leave...",
  "answered": true,
  "sources": [
    {
      "document": "Leave Policy",
      "section": "Annual Leave",
      "snippet": "All full-time employees are entitled to 21 days...",
      "score": 0.823
    }
  ]
}
```

**Response (not found):**
```json
{
  "answer": "I couldn't find that in the company documents. Please contact HR at hr@acmetech.example or +233 30 000 0000.",
  "answered": false,
  "sources": []
}
```

**Response (personal question blocked):**
```json
{
  "answer": "I can only answer general policy questions and I can't access personal records such as leave balances, salaries or payslips...",
  "answered": false,
  "sources": []
}
```

`session_id` is the conversation the turn is filed under. An existing, unexpired
session is appended to; no session is ever created here. A session that has expired
or never existed is answered with **410 Gone** and `{"error": "session_expired"}`
rather than with `answered: false` — see [Expired or Unknown Session](#expired-or-unknown-session).

---

### Ask a Question (streaming)

```bash
POST /chat/stream
Content-Type: application/json

{
  "session_id": "user-session-123",
  "question": "What is the annual leave policy?"
}
```

Same request and same history side effects as `/chat`, but the answer arrives as it
is written instead of all at once. The response is `text/event-stream`, with one
JSON object per `data:` line:

| Event | Meaning |
| --- | --- |
| `status` | The answer is being written, before any of it exists yet. |
| `delta` | A piece of the answer text. Repeat until `done`. |
| `done` | The complete answer and its citations. Sent exactly once, and it is the authoritative one. |
| `error` | The answer could not be finished. Any partial text stays visible. |

```
data: {"type":"status","stage":"writing"}

data: {"type":"delta","text":"Full-time employees "}

data: {"type":"delta","text":"accrue 25 days of annual leave a year."}

data: {"type":"done","answer":"Full-time employees accrue 25 days of annual leave a year.","answered":true,"sources":[...]}
```

`done` carries the same `answer`, `answered` and `sources` as `/chat`, so a client
can render the streamed text as it arrives and then replace it with the finished
answer. That matters for the two cases where the final answer differs from what
was being written: a question the documents do not answer, and one refused as a
personal-data question, both stream their canned wording before `done` corrects
the turn to its real outcome.

The citations ride only on `done`, never on an event of their own part way
through. `done` can still replace the answer with a refusal that cites nothing,
so a client that drew sources before the text would be showing evidence for an
answer that had not been given. Render the citation block when `done` arrives.

The turn is only written to history when the stream completes, so a request
abandoned half way leaves no half-answer behind.

```bash
curl -N -X POST http://localhost:8000/chat/stream \
  -H 'Content-Type: application/json' \
  -d '{"session_id":"user-session-123","question":"What is the annual leave policy?"}'
```

---

### Expired or Unknown Session

Both `/chat` and `/chat/stream` answer a message posted under a session that has
expired, or an id that never existed, with **410 Gone** before any answer work
starts:

```json
{
  "error": "session_expired",
  "message": "Your session has expired. Start a new session to ask again."
}
```

This is deliberately not a 200 with `answered: false`. That is the same body a
genuinely unanswered question returns, so the client filed "your question has no
answer" on a question that was never asked, and went on posting follow-ups into a
session the backend had already deleted. The `session_expired` code is what lets a
client offer the one action that helps: create a new session and resend.

---

### Sessions

A conversation is one session, created once:

```bash
POST /sessions
```

```json
{ "session_id": "3f9c...", "expires_at": "2026-09-30T09:30:00" }
```

Every later message in that conversation sends the **same** `session_id` back in
its body, and the backend appends the turn to that session's history rather than
opening a new one. Nothing else creates a session, so `/history/{session_id}`
returns the whole conversation instead of only its most recent turn, and a follow-up
question cannot land in a session of its own.

Sessions last 30 minutes from creation and are not extended by activity. When one
lapses, the next message is answered with the 410 above and the client is expected
to open a replacement.

---

### Get Chat History

```bash
GET /history/{session_id}
```

**Example:**
```bash
GET /history/user-session-123
```

**Response:**
```json
[
  {
    "question": "What is the annual leave policy?",
    "answer": "Employees are entitled to 21 days of annual leave...",
    "answered": true,
    "sources": [...],
    "created_at": "2026-09-29T15:30:00Z"
  }
]
```

## Testing with cURL

```bash
# Health check
curl http://localhost:8000/health

# List documents
curl http://localhost:8000/documents

# Ask a question
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"session_id": "test-session-123", "question": "What are the working hours?"}'

# Get history
curl http://localhost:8000/history/test-session-123
```

## Deployment (Render)

The `render.yaml` at the repo root configures both the web service and PostgreSQL database automatically.

1. Connect the `employee-intelligence/knowledge-assistant` repo to Render
2. Set `NVIDIA_API_KEY` and `NVIDIA_EMBEDDING_API_KEY` in the Render dashboard
3. Render provisions the database and injects `DATABASE_URL` automatically

## API Docs

Once running, interactive Swagger docs are available at:
- `http://localhost:8000/docs` (Swagger UI)
- `http://localhost:8000/redoc` (ReDoc)
