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
