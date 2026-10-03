# syntax=docker/dockerfile:1
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install dependencies first for better layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code, policy documents, tuning script, and the pre-built
# vector index cache (avoids re-embedding on container start; delete
# backend/storage/ and rebuild if data/ or EMBED_MODEL changes)
COPY app/ ./app/
COPY data/ ./data/
COPY scripts/ ./scripts/
COPY storage/ ./storage/

# Run as a non-root user for security
RUN useradd --create-home appuser && chown -R appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD python -c "import urllib.request,os;urllib.request.urlopen(f\"http://localhost:{os.environ.get('PORT','8000')}/health\")" || exit 1

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
