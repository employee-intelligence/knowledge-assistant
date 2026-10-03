# Knowledge Assistant Backend

Internal knowledge assistant API for Acme Technologies. Answers employee questions using RAG (Retrieval-Augmented Generation) over company policy documents, powered by NVIDIA NIM (gpt-oss-20b + nemotron embeddings).

## Tech Stack

- **Framework:** FastAPI
- **LLM:** openai/gpt-oss-20b (NVIDIA NIM)
- **Embeddings:** nvidia/nemotron-3-embed-1b (NVIDIA NIM)
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
- NVIDIA API key (from [build.nvidia.com](https://build.nvidia.com))

### Option 1: Run with Docker (Recommended)

```bash
# Build and run
docker build -t knowledge-assistant .
docker run -p 8000:8000 \
  -e NVIDIA_API_KEY=your_key_here \
  -e NVIDIA_EMBEDDING_API_KEY=your_key_here \
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
# Edit .env with your NVIDIA API keys and database URL

# 4. Run the app
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NVIDIA_API_KEY` | Yes | — | NVIDIA API key for the LLM |
| `NVIDIA_EMBEDDING_API_KEY` | Yes | — | NVIDIA API key for embeddings |
| `NVIDIA_BASE_URL` | No | `https://integrate.api.nvidia.com/v1` | NVIDIA NIM OpenAI-compatible base URL |
| `LLM_MODEL` | No | `openai/gpt-oss-20b` | Model for generation |
| `EMBED_MODEL` | No | `nvidia/nemotron-3-embed-1b` | Model for embeddings |
| `DATABASE_URL` | No | `postgresql://user:password@localhost:5432/knowledge_assistant` | PostgreSQL connection string |
| `ALLOWED_ORIGINS` | No | `*` | Comma-separated CORS origins |
| `TOP_K` | No | `4` | Number of documents to retrieve |
| `MIN_SCORE` | No | `0.45` | Minimum similarity score threshold |
| `DATA_DIR` | No | `data` | Path to policy documents |

## API Endpoints

### Health Check

```bash
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "index_ready": true
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
