from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    openai_api_key: str = ""
    anthropic_api_key: str = ""
    database_url: str = "postgresql+psycopg://career:career@db:5432/career"
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_host: str = "https://cloud.langfuse.com"
    embedding_model: str = "text-embedding-3-small"
    chat_model: str = "claude-sonnet-4-6"
    embedding_dim: int = 1536
    cors_origins: str = "http://localhost:3000,http://localhost:3001"


settings = Settings()
