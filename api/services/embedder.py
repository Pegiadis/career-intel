from openai import OpenAI
from config import settings


class Embedder:
    def __init__(self, client=None, model: str | None = None, dim: int | None = None):
        self.client = client or OpenAI(api_key=settings.openai_api_key)
        self.model = model or settings.embedding_model
        self.dim = dim or settings.embedding_dim

    def embed(self, texts: list[str]) -> tuple[list[list[float]], int]:
        if not texts:
            return [], 0
        resp = self.client.embeddings.create(model=self.model, input=texts)
        vectors = [d.embedding for d in resp.data]
        return vectors, resp.usage.total_tokens
