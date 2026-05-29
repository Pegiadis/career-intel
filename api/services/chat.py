from pathlib import Path
from collections.abc import Iterator
from anthropic import Anthropic
from config import settings
from models import Chunk

_PROMPT = (Path(__file__).parent.parent / "prompts" / "system_chat.txt").read_text()


def build_context(chunks: list[Chunk]) -> str:
    lines = []
    for c in chunks:
        label = "resume" if c.source_type == "resume" else "JD"
        lines.append(f"[{label} §{c.section}] {c.content}")
    return "\n\n".join(lines)


class ChatService:
    def __init__(self, client=None, model: str | None = None):
        self.client = client or Anthropic(api_key=settings.anthropic_api_key)
        self.model = model or settings.chat_model

    def stream(self, question: str, chunks: list[Chunk]) -> Iterator[str]:
        prompt = _PROMPT.format(context=build_context(chunks), question=question)
        with self.client.messages.stream(
            model=self.model, max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        ) as s:
            yield from s.text_stream
