"""LLM-as-judge quality gate: the chat assistant's answers must be grounded in the
retrieved résumé/JD context. Skipped automatically when API keys are absent (e.g. a
contributor running the unit suite locally); runs in CI when secrets are configured.
"""
import pytest
from config import settings
from models import Chunk
from services.chat import ChatService, build_context
from services.embedder import Embedder
from services.retriever import retrieve
from evals.judge import judge_groundedness

pytestmark = [
    pytest.mark.eval,
    pytest.mark.skipif(
        not settings.anthropic_api_key or not settings.openai_api_key,
        reason="LLM-as-judge eval requires OPENAI_API_KEY + ANTHROPIC_API_KEY",
    ),
]

SECTIONS = {
    "skills": "Python, FastAPI, PostgreSQL, Docker, Redis, RAG, OpenAI",
    "experience": "Senior Backend Engineer, 6 years. Built FastAPI services and RAG pipelines.",
    "education": "BSc Computer Science",
}

CASES = [
    "What is my strongest backend language?",
    "Do I have Kubernetes experience?",     # answer should say it's not in the résumé
    "Have I built RAG systems?",
]

GROUNDEDNESS_THRESHOLD = 4.0


def _seed_resume(db):
    emb = Embedder()
    texts = list(SECTIONS.values())
    vecs, _ = emb.embed(texts)
    for (section, content), vec in zip(SECTIONS.items(), vecs):
        db.add(Chunk(source_type="resume", source_id=1, section=section,
                     content=content, embedding=vec))
    db.commit()


def test_chat_answers_are_grounded(db):
    _seed_resume(db)
    emb = Embedder()
    chat = ChatService()
    scores: list[int] = []

    for question in CASES:
        qvec, _ = emb.embed([question])
        chunks = retrieve(db, qvec[0], resume_id=1, job_id=None, keyword=question[:40])
        answer = "".join(chat.stream(question, chunks))
        verdict = judge_groundedness(question, answer, build_context(chunks))
        scores.append(verdict["score"])

    avg = sum(scores) / len(scores)
    assert avg >= GROUNDEDNESS_THRESHOLD, f"groundedness {avg} below {GROUNDEDNESS_THRESHOLD}: {scores}"
