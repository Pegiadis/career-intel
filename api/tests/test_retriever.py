from models import Chunk
from services.retriever import retrieve


def _add(db, sid, content, vec):
    db.add(Chunk(source_type="resume", source_id=sid, section="skills",
                 content=content, embedding=vec))
    db.commit()


def test_retrieves_nearest_by_cosine(db):
    _add(db, 1, "Python and FastAPI", [1.0] + [0.0] * 1535)
    _add(db, 1, "Cooking recipes", [0.0, 1.0] + [0.0] * 1534)
    hits = retrieve(db, query_vec=[1.0] + [0.0] * 1535,
                    resume_id=1, job_id=None, keyword="", k=1)
    assert hits[0].content == "Python and FastAPI"


def test_keyword_boost_pulls_exact_match(db):
    _add(db, 1, "Kubernetes orchestration", [0.0] * 1536)
    hits = retrieve(db, query_vec=[0.0] * 1536, resume_id=1, job_id=None,
                    keyword="Kubernetes", k=5)
    assert any("Kubernetes" in h.content for h in hits)
