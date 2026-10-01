from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Generation key. NVIDIA's OpenAI-compatible API, so the OpenAI SDK talks to
    # it with nothing changed but the base URL.
    nvidia_api_key: str = ""
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    # Chosen for time-to-first-token, not size. The previous default
    # (`z-ai/glm-5.3-flash`) reasoned for ~90s before writing a word, which no
    # amount of streaming can make feel responsive; this one starts in ~2s on the
    # same retrieval prompt while still following the answer-only-from-context
    # instructions. Verified provisioned on the generation key, unlike several
    # other fast candidates (nemotron-nano-3-30b, mistral-7b-instruct) which 404.
    llm_model: str = "openai/gpt-oss-20b"
    llm_temperature: float = 0.5
    llm_top_p: float = 1
    llm_max_tokens: int = 1024

    # A separate key for retrieval, so the embedding traffic has its own quota
    # and a generation throttle cannot stop the index from being built.
    nvidia_embedding_api_key: str = ""

    # Purpose-built for question retrieval rather than general embeddings, and
    # verified to be provisioned on the retrieval key. Others this project could
    # have used answer 404 "function not found for account"
    # (nv-embedqa-mistral-7b-v2, embed-qa-4, arctic-embed-l) or 410 Gone
    # (llama-3.2-nv-embedqa-1b-v2, nv-embedqa-e5-v5, nv-embed-v1, bge-m3).
    embed_model: str = "nvidia/nemotron-3-embed-1b"
    data_dir: str = "data"
    top_k: int = 4
    min_score: float = 0.40
    database_url: str = "postgresql://user:password@localhost:5432/knowledge_assistant"
    allowed_origins: str = "*"

    # Per-model attempts before giving up. A 429/5xx is load that usually clears,
    # so it is worth waiting on; a 4xx is a rejected key or a model the account
    # cannot reach, and asking again can only fail the same way.
    llm_max_attempts: int = 3
    llm_retry_base_seconds: float = 0.5

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    @property
    def has_nvidia_api_key(self) -> bool:
        return bool(self.nvidia_api_key.strip())

    @property
    def has_nvidia_embedding_api_key(self) -> bool:
        return bool(self.nvidia_embedding_api_key.strip())


settings = Settings()