from services.embedder import Embedder
from routers.resumes import ingest_resume
from models import Chunk

class FakeEmb(Embedder):
    def __init__(self): pass
    def embed(self, texts):
        return [[0.1] * 1536 for _ in texts], len(texts)

RAW = "Jane\nSkills\nPython, FastAPI\nExperience\nBuilt RAG systems.\n"

def test_ingest_creates_chunks(db):
    resume = ingest_resume(db, "jane.pdf", RAW, FakeEmb())
    chunks = db.query(Chunk).filter_by(source_id=resume.id).all()
    assert {c.section for c in chunks} == {"skills", "experience"}
    assert all(len(c.embedding) == 1536 for c in chunks)
