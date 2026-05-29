import json
from pathlib import Path
from anthropic import Anthropic
from config import settings

_PROMPT = (Path(__file__).parent.parent / "prompts" / "skill_extraction.txt").read_text()


class JdParser:
    def __init__(self, client=None, model: str | None = None):
        self.client = client or Anthropic(api_key=settings.anthropic_api_key)
        self.model = model or settings.chat_model

    def parse(self, jd_text: str) -> dict:
        msg = self.client.messages.create(
            model=self.model, max_tokens=1024,
            messages=[{"role": "user", "content": _PROMPT.format(jd_text=jd_text)}],
        )
        text = msg.content[0].text
        return json.loads(text[text.find("{"): text.rfind("}") + 1])
