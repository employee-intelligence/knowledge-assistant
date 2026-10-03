from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Values are read from environment variables (case-insensitive) and, when the
    # process runs from the backend/ directory, from a local .env file. Anything
    # not set in the environment falls back to the default declared below.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # NVIDIA NIM provides an OpenAI-compatible endpoint, so a single API key
    # works for both the chat LLM and the embedding model. The embedding key
    # is kept separate in case you provision them under different projects.
    nvidia_api_key: str = ""
    nvidia_embedding_api_key: str = ""
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"

    # Chat model and embedding model served on NVIDIA NIM. These MUST match the
    # IDs listed on build.nvidia.com, otherwise the API returns 404.
    llm_model: str = "openai/gpt-oss-20b"
    embed_model: str = "nvidia/nemotron-3-embed-1b"

    # Generation parameters. llm_max_tokens caps response length; gpt-oss models
    # also emit a hidden reasoning trace, so very small values can yield empty text.
    llm_max_tokens: int = 1024
    llm_temperature: float = 0.5
    llm_top_p: float = 1.0

    # How many retrieved chunks are passed to the LLM as context.
    top_k: int = 4
    # Minimum vector similarity (0–1) for a chunk to count as relevant.
    min_score: float = 0.45
    # Directory that holds the markdown policy documents to index.
    data_dir: str = "data"

    # Database connection. Defaults to a local Postgres; production uses DATABASE_URL.
    database_url: str = "postgresql://user:password@localhost:5432/knowledge_assistant"
    allowed_origins: str = "*"
    # Secret used to sign JWT access tokens — override in every real deployment.
    jwt_secret_key: str = "change-me-in-production"

    @property
    def origins_list(self) -> list[str]:
        # ALLOWED_ORIGINS is a comma-separated string in the environment; split it here.
        return [o.strip() for o in self.allowed_origins.split(",")]


settings = Settings()
