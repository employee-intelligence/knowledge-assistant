from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    google_api_key: str = ""
    llm_model: str = "gemini-3.8-flash"

    # Tried in order whenever the primary model is throttled or out of service.
    # Gemini model names are retired without warning, so answering from a sibling
    # model beats handing the user a 500.
    llm_fallback_models: str = "gemini-3.5-flash,gemini-3.7-flash,gemini-flash-latest"

    embed_model: str = "gemini-embedding-001"
    data_dir: str = "data"
    top_k: int = 4
    min_score: float = 0.45
    database_url: str = "postgresql://user:password@localhost:5432/knowledge_assistant"
    allowed_origins: str = "*"
    jwt_secret_key: str = "change-me-in-production"

    # Per-model attempts before moving to the next one in the chain.
    llm_max_attempts: int = 3
    llm_retry_base_seconds: float = 0.5

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    @property
    def llm_models(self) -> list[str]:
        """The primary model first, then the fallbacks, order kept, no repeats."""
        chain = [self.llm_model] + [m.strip() for m in self.llm_fallback_models.split(",")]
        return list(dict.fromkeys(m for m in chain if m))

    @property
    def has_google_api_key(self) -> bool:
        return bool(self.google_api_key.strip())


settings = Settings()