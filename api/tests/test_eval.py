import json
from pathlib import Path
from models import Chunk
from services.retriever import retrieve

SECTIONS = {
    "skills": "Python, FastAPI, PostgreSQL, RAG",
    "experience": "Senior Engineer at Acme. Built RAG systems.",
    "education": "BSc Computer Science",
}

def _vec_for(section: str) -> list[float]:
    base = [0.0] * 1536
    idx = {"skills": 0, "experience": 1, "education": 2}[section]
    base[idx] = 1.0
    return base

def test_retrieval_recall(db):
    for sec, content in SECTIONS.items():
        db.add(Chunk(source_type="resume", source_id=1, section=sec,
                     content=content, embedding=_vec_for(sec)))
    db.commit()
    cases = json.loads((Path(__file__).parent / "fixtures" / "eval_set.json").read_text())
    hits = 0
    for case in cases:
        qvec = _vec_for(case["expect_section"])
        results = retrieve(db, qvec, resume_id=1, job_id=None,
                           keyword=case["expect_substring"], k=3)
        if any(case["expect_substring"] in r.content for r in results):
            hits += 1
    recall = hits / len(cases)
    assert recall >= 0.8, f"retrieval recall too low: {recall}"
