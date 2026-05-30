from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from db import SessionLocal
from models import Job, Chunk, FitAnalysis
from services.jd_parser import JdParser
from services.chunker import chunk_text
from services.embedder import Embedder
from schemas import JobOut

router = APIRouter(prefix="/jobs", tags=["jobs"])


def get_db():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


class JobIn(BaseModel):
    title: str
    company: str
    text: str
    source_url: str | None = None


def ingest_job(db: Session, data: "JobIn", parser: JdParser, embedder: Embedder) -> Job:
    parsed = parser.parse(data.text)
    job = Job(title=data.title, company=data.company, raw_text=data.text,
              parsed_jd=parsed, source_url=data.source_url)
    db.add(job)
    db.flush()
    pieces = chunk_text(data.text)
    vectors, _ = embedder.embed(pieces)
    for piece, vec in zip(pieces, vectors):
        db.add(Chunk(source_type="job", source_id=job.id, section="jd",
                     content=piece, embedding=vec))
    db.commit()
    db.refresh(job)
    return job


@router.post("", response_model=JobOut)
def create_job(data: JobIn, db: Session = Depends(get_db)):
    job = ingest_job(db, data, JdParser(), Embedder())
    return JobOut(id=job.id, title=job.title, company=job.company)


@router.get("", response_model=list[JobOut])
def list_jobs(resume_id: int | None = None, db: Session = Depends(get_db)):
    jobs = db.query(Job).all()
    scores: dict[int, int] = {}
    if resume_id is not None:
        for fa in db.query(FitAnalysis).filter_by(resume_id=resume_id).all():
            scores[fa.job_id] = fa.fit_score
    return [JobOut(id=j.id, title=j.title, company=j.company, fit_score=scores.get(j.id))
            for j in jobs]
