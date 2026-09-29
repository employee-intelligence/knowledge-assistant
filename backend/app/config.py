from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    google_api_key: str = ""
    llm_model: str = "gemini-2.5-flash"
    embed_model: str = "gemini-embedding-001"
    data_dir: str = "data"
    top_k: int = 4
    min_score: float = 0.45
    database_url: str = "sqlite:///./history.db"
    allowed_origins: str = "*"

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]


settings = Settings()