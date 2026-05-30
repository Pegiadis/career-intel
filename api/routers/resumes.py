from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session
from db import SessionLocal
from models import Resume, Chunk
from services.pdf_parser import extract_text, split_into_sections
from services.chunker import chunk_resume_sections
from services.embedder import Embedder
from schemas import ResumeOut

router = APIRouter(prefix="/resumes", tags=["resumes"])


def get_db():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


def ingest_resume(db: Session, filename: str, raw_text: str, embedder: Embedder) -> Resume:
    sections = split_into_sections(raw_text)
    resume = Resume(filename=filename, raw_text=raw_text, parsed_sections=sections)
    db.add(resume)
    db.flush()
    chunk_dicts = chunk_resume_sections(sections)
    vectors, _ = embedder.embed([c["content"] for c in chunk_dicts]) if chunk_dicts else ([], 0)
    for cd, vec in zip(chunk_dicts, vectors):
        db.add(Chunk(source_type="resume", source_id=resume.id,
                     section=cd["section"], content=cd["content"], embedding=vec))
    db.commit()
    db.refresh(resume)
    return resume


@router.post("", response_model=ResumeOut)
async def upload_resume(file: UploadFile = File(...), db: Session = Depends(get_db)):
    import tempfile
    import os
    data = await file.read()
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(data)
        path = f.name
    try:
        raw = extract_text(path)
    finally:
        os.unlink(path)
    resume = ingest_resume(db, file.filename or "resume.pdf", raw, Embedder())
    n_chunks = db.query(Chunk).filter_by(source_type="resume", source_id=resume.id).count()
    return ResumeOut(id=resume.id, filename=resume.filename,
                     section_count=len(resume.parsed_sections), chunk_count=n_chunks)


@router.get("/latest", response_model=ResumeOut)
def latest_resume(db: Session = Depends(get_db)):
    resume = db.query(Resume).order_by(Resume.id.desc()).first()
    if not resume:
        raise HTTPException(status_code=404, detail="no resume")
    n_chunks = db.query(Chunk).filter_by(source_type="resume", source_id=resume.id).count()
    return ResumeOut(id=resume.id, filename=resume.filename,
                     section_count=len(resume.parsed_sections), chunk_count=n_chunks)
