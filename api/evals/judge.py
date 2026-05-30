"""LLM-as-judge: score whether an answer is grounded in the provided context.

Used by the eval test suite and the CI quality gate. The judge is a separate, cheap
Claude call that rates faithfulness 1-5 with an explicit rubric, so scores are
reproducible enough to gate a build on.
"""
import json
from anthropic import Anthropic
from config import settings

_PROMPT = """You are a strict evaluator of an AI assistant's answer.
Rate how well the ANSWER is grounded in the CONTEXT on a 1-5 scale:
5 = every factual claim is directly supported by the context
4 = supported, with minor unsupported phrasing
3 = partially supported
2 = mostly unsupported
1 = fabricated or contradicts the context
An answer that correctly says information is NOT in the context scores 5.

CONTEXT:
{context}

QUESTION: {question}

ANSWER: {answer}

Return ONLY JSON: {{"score": <integer 1-5>, "reason": "<one sentence>"}}"""


def judge_groundedness(question: str, answer: str, context: str,
                       client=None, model: str | None = None) -> dict:
    client = client or Anthropic(api_key=settings.anthropic_api_key)
    model = model or settings.chat_model
    msg = client.messages.create(
        model=model, max_tokens=200,
        messages=[{"role": "user", "content": _PROMPT.format(
            context=context, question=question, answer=answer)}],
    )
    text = msg.content[0].text
    return json.loads(text[text.find("{"): text.rfind("}") + 1])
