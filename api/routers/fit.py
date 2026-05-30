import json
import re
from pathlib import Path
from fastapi import APIRouter, Depends
from anthropic import Anthropic
from sqlalchemy.orm import Session
from db import SessionLocal
from models import Resume, Job, Chunk, FitAnalysis
from services.embedder import Embedder
from services.skill_matcher import match_skills
from services.fit_analyzer import compute_fit
from config import settings
from schemas import FitOut

router = APIRouter(prefix="/fit", tags=["fit"])
_P = Path(__file__).parent.parent / "prompts"
_SUMMARY = (_P / "fit_summary.txt").read_text()
_QUESTIONS = (_P / "interview_questions.txt").read_text()


def get_db():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


def _resume_years(resume: Resume) -> int:
    yrs = [int(y) for y in re.findall(r"(?:19|20)\d{2}", resume.raw_text)]
    return (max(yrs) - min(yrs)) if len(yrs) >= 2 else 5


def analyze_fit(db: Session, resume_id: int, job_id: int) -> dict:
    resume = db.get(Resume, resume_id)
    job = db.get(Job, job_id)
    jd = job.parsed_jd
    embedder = Embedder()
    jd_skills = jd.get("required_skills", []) + jd.get("nice_to_have", [])
    jd_vecs_list, _ = embedder.embed(jd_skills) if jd_skills else ([], 0)
    jd_skill_vecs = dict(zip(jd_skills, jd_vecs_list))
    resume_chunks = db.query(Chunk).filter_by(source_type="resume", source_id=resume_id).all()
    resume_skill_vecs = {c.section: c.embedding for c in resume_chunks}

    matched_req, missing_req = match_skills(jd.get("required_skills", []), resume.raw_text,
                                            resume_skill_vecs, jd_skill_vecs)
    matched_nice, _ = match_skills(jd.get("nice_to_have", []), resume.raw_text,
                                   resume_skill_vecs, jd_skill_vecs)
    fit = compute_fit(matched_req, jd.get("required_skills", []),
                      matched_nice, jd.get("nice_to_have", []),
                      _resume_years(resume), jd.get("min_years"))

    client = Anthropic(api_key=settings.anthropic_api_key)
    summary = client.messages.create(
        model=settings.chat_model, max_tokens=300,
        messages=[{"role": "user", "content": _SUMMARY.format(
            matched=matched_req, missing=missing_req,
            seniority=fit["sub_scores"]["seniority_match"])}],
    ).content[0].text
    q_raw = client.messages.create(
        model=settings.chat_model, max_tokens=500,
        messages=[{"role": "user", "content": _QUESTIONS.format(
            matched=matched_req, missing=missing_req)}],
    ).content[0].text
    questions = json.loads(q_raw[q_raw.find("["): q_raw.rfind("]") + 1])

    db.merge(FitAnalysis(resume_id=resume_id, job_id=job_id, fit_score=fit["fit_score"],
                         matched_skills=matched_req, missing_skills=missing_req,
                         sub_scores=fit["sub_scores"], summary=summary))
    db.commit()
    return {"resume_id": resume_id, "job_id": job_id, "fit_score": fit["fit_score"],
            "sub_scores": fit["sub_scores"], "matched_skills": matched_req,
            "missing_skills": missing_req, "summary": summary,
            "interview_questions": questions}


@router.post("/{resume_id}/{job_id}", response_model=FitOut)
def analyze(resume_id: int, job_id: int, db: Session = Depends(get_db)):
    return FitOut(**analyze_fit(db, resume_id, job_id))
