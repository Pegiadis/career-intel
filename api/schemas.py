from pydantic import BaseModel


class ResumeOut(BaseModel):
    id: int
    filename: str
    section_count: int
    chunk_count: int


class JobOut(BaseModel):
    id: int
    title: str
    company: str
    fit_score: int | None = None


class ChatRequest(BaseModel):
    resume_id: int
    job_id: int | None = None
    question: str


class FitOut(BaseModel):
    resume_id: int
    job_id: int
    fit_score: int
    sub_scores: dict
    matched_skills: list[str]
    missing_skills: list[str]
    summary: str
    interview_questions: list[dict]
