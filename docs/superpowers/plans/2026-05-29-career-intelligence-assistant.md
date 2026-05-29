# Career Intelligence Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fullstack RAG app that analyzes a resume against multiple job descriptions, producing an explainable fit score, skill-gap analysis, generated interview questions, and a grounded chat — for the NewPage take-home.

**Architecture:** Next.js workspace (left rail + fit dashboard + docked chat) → FastAPI backend → Postgres+pgvector. OpenAI for embeddings, Anthropic Claude for chat/extraction. No orchestration framework (direct API calls). Fit score is computed deterministically; the LLM only writes prose on top. Everything runs via `docker compose up`.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0, pgvector, pydantic-settings, pypdf, OpenAI SDK, Anthropic SDK, structlog, Langfuse, pytest; Next.js 14 (App Router), TypeScript, Tailwind, shadcn/ui; Docker Compose.

---

## Conventions

- All backend commands run from `api/` unless noted; tests use a **real** Postgres (the `db` compose service), never mocks for DB.
- External LLM/embedding clients are injected as constructor args so tests pass fakes — no network in unit tests.
- Commit after every green step. Branch: `main` (fresh repo; the user will `git init` when ready — do not init or commit until the user says so).
- Python: `ruff` + `mypy` clean. Line length 100.

## File structure (locked during brainstorming)

```
newpage-career-intel/
  docker-compose.yml
  .env.example
  README.md
  api/
    pyproject.toml
    app.py                  # FastAPI app, lifespan, CORS, router mounts
    config.py               # pydantic-settings
    db.py                   # engine, Session, Base, init_db
    models/  resume.py job.py chunk.py query.py fit.py __init__.py
    schemas.py              # pydantic request/response models
    services/
      pdf_parser.py jd_parser.py chunker.py embedder.py
      retriever.py chat.py fit_analyzer.py skill_matcher.py guardrails.py
    prompts/  system_chat.txt fit_summary.txt skill_extraction.txt interview_questions.txt
    observability/  logger.py tracing.py
    seed.py                 # anonymized demo data loader
    tests/
      conftest.py
      test_pdf_parser.py test_chunker.py test_fit_analyzer.py
      test_skill_matcher.py test_guardrails.py test_retriever.py
      test_ingest_e2e.py test_chat_e2e.py test_eval.py
      fixtures/ sample_resume.pdf sample_jd_globex.txt eval_set.json
  web/
    package.json next.config.mjs tailwind.config.ts tsconfig.json
    app/ layout.tsx page.tsx globals.css
    components/ ResumeUpload.tsx JobInput.tsx JobList.tsx
                FitDashboard.tsx InterviewPrep.tsx ChatPanel.tsx
                ObservabilityHeader.tsx
    lib/ api.ts sse.ts types.ts
```

---

# PHASE 0 — Infra & scaffold

### Task 1: Repo skeleton + Docker Compose + Postgres/pgvector

**Files:**
- Create: `docker-compose.yml`, `.env.example`, `api/pyproject.toml`, `.gitignore`

- [ ] **Step 1: Create `.gitignore`**

```
__pycache__/
*.pyc
.env
.venv/
node_modules/
.next/
.superpowers/
api/tests/fixtures/*.tmp
```

- [ ] **Step 2: Create `.env.example`**

```
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=postgresql+psycopg://career:career@db:5432/career
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_HOST=https://cloud.langfuse.com
EMBEDDING_MODEL=text-embedding-3-small
CHAT_MODEL=claude-sonnet-4-6
```

- [ ] **Step 3: Create `docker-compose.yml`**

```yaml
services:
  db:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: career
      POSTGRES_PASSWORD: career
      POSTGRES_DB: career
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U career"]
      interval: 3s
      retries: 10

  api:
    build: ./api
    env_file: .env
    ports: ["8000:8000"]
    depends_on:
      db: { condition: service_healthy }
    volumes: ["./api:/app"]
    command: uvicorn app:app --host 0.0.0.0 --port 8000 --reload

  web:
    build: ./web
    env_file: .env
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8000
    ports: ["3000:3000"]
    depends_on: [api]
    volumes: ["./web:/app", "/app/node_modules"]

volumes:
  pgdata:
```

- [ ] **Step 4: Create `api/pyproject.toml`**

```toml
[project]
name = "career-intel-api"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
  "fastapi>=0.111", "uvicorn[standard]>=0.30",
  "sqlalchemy>=2.0", "psycopg[binary]>=3.1", "pgvector>=0.3",
  "pydantic>=2.7", "pydantic-settings>=2.3",
  "pypdf>=4.2", "openai>=1.30", "anthropic>=0.30",
  "structlog>=24.1", "langfuse>=2.36", "tiktoken>=0.7",
]
[project.optional-dependencies]
dev = ["pytest>=8.2", "pytest-asyncio>=0.23", "httpx>=0.27", "ruff>=0.5", "mypy>=1.10"]

[tool.ruff]
line-length = 100
[tool.pytest.ini_options]
asyncio_mode = "auto"
```

- [ ] **Step 5: Create `api/Dockerfile`**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir -e ".[dev]"
COPY . .
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 6: Verify db boots**

Run: `docker compose up db -d && docker compose exec db pg_isready -U career`
Expected: `accepting connections`

---

### Task 2: Config + DB session + pgvector extension

**Files:**
- Create: `api/config.py`, `api/db.py`

- [ ] **Step 1: Create `api/config.py`**

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    openai_api_key: str = ""
    anthropic_api_key: str = ""
    database_url: str = "postgresql+psycopg://career:career@db:5432/career"
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_host: str = "https://cloud.langfuse.com"
    embedding_model: str = "text-embedding-3-small"
    chat_model: str = "claude-sonnet-4-6"
    embedding_dim: int = 1536


settings = Settings()
```

- [ ] **Step 2: Create `api/db.py`**

```python
from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def init_db() -> None:
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()
    import models  # noqa: F401  (register mappers)
    Base.metadata.create_all(engine)
```

- [ ] **Step 3: Commit** (only once the user has authorized git)

```bash
git add docker-compose.yml .env.example .gitignore api/
git commit -m "chore: project scaffold, docker compose, db session"
```

---

### Task 3: SQLAlchemy models

**Files:**
- Create: `api/models/__init__.py`, `resume.py`, `job.py`, `chunk.py`, `query.py`, `fit.py`

- [ ] **Step 1: Create `api/models/resume.py`**

```python
from datetime import datetime
from sqlalchemy import String, Text, DateTime, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from db import Base


class Resume(Base):
    __tablename__ = "resumes"
    id: Mapped[int] = mapped_column(primary_key=True)
    filename: Mapped[str] = mapped_column(String(255))
    raw_text: Mapped[str] = mapped_column(Text)
    parsed_sections: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
```

- [ ] **Step 2: Create `api/models/job.py`**

```python
from datetime import datetime
from sqlalchemy import String, Text, DateTime, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from db import Base


class Job(Base):
    __tablename__ = "jobs"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    company: Mapped[str] = mapped_column(String(255))
    raw_text: Mapped[str] = mapped_column(Text)
    parsed_jd: Mapped[dict] = mapped_column(JSONB, default=dict)
    source_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
```

- [ ] **Step 3: Create `api/models/chunk.py`**

```python
from datetime import datetime
from pgvector.sqlalchemy import Vector
from sqlalchemy import String, Text, Integer, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from config import settings
from db import Base


class Chunk(Base):
    __tablename__ = "chunks"
    id: Mapped[int] = mapped_column(primary_key=True)
    source_type: Mapped[str] = mapped_column(String(16))   # "resume" | "job"
    source_id: Mapped[int] = mapped_column(Integer, index=True)
    section: Mapped[str] = mapped_column(String(64), default="")
    content: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float]] = mapped_column(Vector(settings.embedding_dim))
    token_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
```

- [ ] **Step 4: Create `api/models/query.py`**

```python
from datetime import datetime
from sqlalchemy import Text, Integer, DateTime, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column
from db import Base


class Query(Base):
    __tablename__ = "queries"
    id: Mapped[int] = mapped_column(primary_key=True)
    question: Mapped[str] = mapped_column(Text)
    resume_id: Mapped[int] = mapped_column(Integer)
    job_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    response: Mapped[str] = mapped_column(Text, default="")
    retrieved_chunk_ids: Mapped[list[int]] = mapped_column(ARRAY(Integer), default=list)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    tokens_used: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
```

- [ ] **Step 5: Create `api/models/fit.py`**

```python
from datetime import datetime
from sqlalchemy import Text, Integer, DateTime, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from db import Base


class FitAnalysis(Base):
    __tablename__ = "fit_analyses"
    id: Mapped[int] = mapped_column(primary_key=True)
    resume_id: Mapped[int] = mapped_column(Integer, index=True)
    job_id: Mapped[int] = mapped_column(Integer, index=True)
    fit_score: Mapped[int] = mapped_column(Integer)
    matched_skills: Mapped[list] = mapped_column(JSONB, default=list)
    missing_skills: Mapped[list] = mapped_column(JSONB, default=list)
    sub_scores: Mapped[dict] = mapped_column(JSONB, default=dict)
    summary: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
```

- [ ] **Step 6: Create `api/models/__init__.py`**

```python
from models.resume import Resume
from models.job import Job
from models.chunk import Chunk
from models.query import Query
from models.fit import FitAnalysis

__all__ = ["Resume", "Job", "Chunk", "Query", "FitAnalysis"]
```

- [ ] **Step 7: Create `api/tests/conftest.py`**

```python
import pytest
from sqlalchemy import text
from db import engine, SessionLocal, init_db


@pytest.fixture(scope="session", autouse=True)
def _schema():
    init_db()
    yield


@pytest.fixture
def db():
    s = SessionLocal()
    yield s
    s.rollback()
    # clean tables between tests
    for tbl in ("chunks", "fit_analyses", "queries", "jobs", "resumes"):
        s.execute(text(f"TRUNCATE {tbl} RESTART IDENTITY CASCADE"))
    s.commit()
    s.close()
```

- [ ] **Step 8: Verify schema creates**

Run: `docker compose run --rm api pytest tests/conftest.py -q`
Expected: no collection errors (0 tests, schema built).

- [ ] **Step 9: Commit**

```bash
git add api/models api/tests/conftest.py
git commit -m "feat: sqlalchemy models + test db fixtures"
```

---

# PHASE 1 — Resume ingestion (TDD core)

### Task 4: PDF parser with section detection

**Files:**
- Create: `api/services/pdf_parser.py`, `api/tests/test_pdf_parser.py`

- [ ] **Step 1: Write the failing test**

```python
# api/tests/test_pdf_parser.py
from services.pdf_parser import split_into_sections

RAW = """John Doe
Summary
Senior engineer with 6 years.
Experience
Acme - Backend Engineer 2020-2026
Built APIs.
Skills
Python, FastAPI, PostgreSQL
Education
BSc Computer Science
"""


def test_splits_known_headings():
    sections = split_into_sections(RAW)
    assert set(sections) >= {"summary", "experience", "skills", "education"}
    assert "Python" in sections["skills"]
    assert "Built APIs." in sections["experience"]


def test_text_before_first_heading_is_header():
    sections = split_into_sections(RAW)
    assert "John Doe" in sections["header"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose run --rm api pytest tests/test_pdf_parser.py -v`
Expected: FAIL — `ModuleNotFoundError: services.pdf_parser`.

- [ ] **Step 3: Write minimal implementation**

```python
# api/services/pdf_parser.py
import re
from pypdf import PdfReader

HEADINGS = ["summary", "experience", "skills", "education", "projects", "certifications"]
_HEADING_RE = re.compile(rf"^\s*({'|'.join(HEADINGS)})\s*:?\s*$", re.IGNORECASE)


def extract_text(path: str) -> str:
    reader = PdfReader(path)
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def split_into_sections(text: str) -> dict[str, str]:
    sections: dict[str, list[str]] = {"header": []}
    current = "header"
    for line in text.splitlines():
        m = _HEADING_RE.match(line.strip())
        if m:
            current = m.group(1).lower()
            sections.setdefault(current, [])
            continue
        sections.setdefault(current, []).append(line)
    return {k: "\n".join(v).strip() for k, v in sections.items() if "\n".join(v).strip()}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose run --rm api pytest tests/test_pdf_parser.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add api/services/pdf_parser.py api/tests/test_pdf_parser.py
git commit -m "feat: resume pdf parser with section detection"
```

---

### Task 5: Chunker (section-aware for resume, recursive for JD)

**Files:**
- Create: `api/services/chunker.py`, `api/tests/test_chunker.py`

- [ ] **Step 1: Write the failing test**

```python
# api/tests/test_chunker.py
from services.chunker import chunk_resume_sections, chunk_text

def test_resume_chunks_one_per_section():
    sections = {"summary": "S", "skills": "Python, FastAPI", "experience": "E"}
    chunks = chunk_resume_sections(sections)
    sects = {c["section"] for c in chunks}
    assert sects == {"summary", "skills", "experience"}
    assert all(c["content"] for c in chunks)

def test_recursive_chunk_respects_max_chars():
    text = "word " * 500  # 2500 chars
    chunks = chunk_text(text, max_chars=400, overlap=40)
    assert len(chunks) > 1
    assert all(len(c) <= 400 for c in chunks)

def test_recursive_chunk_has_overlap():
    text = "abcdefghij" * 50
    chunks = chunk_text(text, max_chars=100, overlap=20)
    assert chunks[0][-20:] == chunks[1][:20]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose run --rm api pytest tests/test_chunker.py -v`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

```python
# api/services/chunker.py
def chunk_resume_sections(sections: dict[str, str]) -> list[dict]:
    return [
        {"section": name, "content": body}
        for name, body in sections.items()
        if name != "header" and body.strip()
    ]


def chunk_text(text: str, max_chars: int = 1800, overlap: int = 180) -> list[str]:
    if len(text) <= max_chars:
        return [text]
    chunks, start = [], 0
    while start < len(text):
        end = start + max_chars
        chunks.append(text[start:end])
        if end >= len(text):
            break
        start = end - overlap
    return chunks
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose run --rm api pytest tests/test_chunker.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add api/services/chunker.py api/tests/test_chunker.py
git commit -m "feat: section-aware + recursive chunkers"
```

---

### Task 6: Embedder (injected client, cost tracking)

**Files:**
- Create: `api/services/embedder.py`, `api/tests/test_embedder.py`

- [ ] **Step 1: Write the failing test**

```python
# api/tests/test_embedder.py
from services.embedder import Embedder

class FakeClient:
    def __init__(self): self.calls = 0
    class embeddings:  # noqa
        pass

class FakeEmbeddings:
    def __init__(self, dim): self.dim = dim; self.calls = 0
    def create(self, model, input):
        self.calls += 1
        data = [type("E", (), {"embedding": [0.1] * self.dim})() for _ in input]
        usage = type("U", (), {"total_tokens": 7 * len(input)})()
        return type("R", (), {"data": data, "usage": usage})()

class FakeOpenAI:
    def __init__(self, dim=1536): self.embeddings = FakeEmbeddings(dim)

def test_embeds_batch_and_tracks_tokens():
    emb = Embedder(client=FakeOpenAI(dim=4), model="m", dim=4)
    vectors, tokens = emb.embed(["a", "b", "c"])
    assert len(vectors) == 3
    assert len(vectors[0]) == 4
    assert tokens == 21
    assert emb.client.embeddings.calls == 1   # one batched call
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose run --rm api pytest tests/test_embedder.py -v`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

```python
# api/services/embedder.py
from openai import OpenAI
from config import settings


class Embedder:
    def __init__(self, client=None, model: str | None = None, dim: int | None = None):
        self.client = client or OpenAI(api_key=settings.openai_api_key)
        self.model = model or settings.embedding_model
        self.dim = dim or settings.embedding_dim

    def embed(self, texts: list[str]) -> tuple[list[list[float]], int]:
        if not texts:
            return [], 0
        resp = self.client.embeddings.create(model=self.model, input=texts)
        vectors = [d.embedding for d in resp.data]
        return vectors, resp.usage.total_tokens
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose run --rm api pytest tests/test_embedder.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/services/embedder.py api/tests/test_embedder.py
git commit -m "feat: openai embedder with batching + token tracking"
```

---

### Task 7: Resumes router + ingestion pipeline (integration)

**Files:**
- Create: `api/schemas.py`, `api/routers/__init__.py`, `api/routers/resumes.py`, `api/app.py`, `api/tests/test_ingest_e2e.py`
- Modify: none

- [ ] **Step 1: Create `api/schemas.py`**

```python
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
```

- [ ] **Step 2: Create `api/routers/resumes.py`**

```python
from fastapi import APIRouter, UploadFile, File, Depends
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
    import tempfile, os
    data = await file.read()
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(data); path = f.name
    try:
        raw = extract_text(path)
    finally:
        os.unlink(path)
    resume = ingest_resume(db, file.filename or "resume.pdf", raw, Embedder())
    n_chunks = db.query(Chunk).filter_by(source_type="resume", source_id=resume.id).count()
    return ResumeOut(id=resume.id, filename=resume.filename,
                     section_count=len(resume.parsed_sections), chunk_count=n_chunks)
```

- [ ] **Step 3: Create `api/app.py`**

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from db import init_db
from routers import resumes


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Career Intelligence Assistant", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000"],
                   allow_methods=["*"], allow_headers=["*"])
app.include_router(resumes.router)


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 4: Create `api/routers/__init__.py`** (empty file)

- [ ] **Step 5: Write the integration test (uses a fake embedder via the pipeline fn)**

```python
# api/tests/test_ingest_e2e.py
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
```

- [ ] **Step 6: Run test to verify it passes**

Run: `docker compose run --rm api pytest tests/test_ingest_e2e.py -v`
Expected: PASS.

- [ ] **Step 7: Verify the live endpoint**

Run: `docker compose up -d && curl -s -F file=@api/tests/fixtures/sample_resume.pdf localhost:8000/resumes`
Expected: JSON with `chunk_count > 0`. (Requires a real `OPENAI_API_KEY` in `.env`; create `sample_resume.pdf` in Task 23 — until then run only the unit test in Step 6.)

- [ ] **Step 8: Commit**

```bash
git add api/schemas.py api/routers api/app.py api/tests/test_ingest_e2e.py
git commit -m "feat: resume upload + ingestion pipeline"
```

---

# PHASE 2 — JD ingestion, retrieval, chat

### Task 8: JD parser (Claude → structured JSON, injected client)

**Files:**
- Create: `api/prompts/skill_extraction.txt`, `api/services/jd_parser.py`, `api/tests/test_jd_parser.py`

- [ ] **Step 1: Create `api/prompts/skill_extraction.txt`**

```
You extract structured data from a job description. Return ONLY valid JSON with keys:
required_skills (array of short skill strings), nice_to_have (array),
responsibilities (array), seniority (one of: junior, mid, senior, staff),
min_years (integer or null), salary (string or null), location (string or null).
Job description:
---
{jd_text}
---
JSON:
```

- [ ] **Step 2: Write the failing test**

```python
# api/tests/test_jd_parser.py
from services.jd_parser import JdParser

class FakeMsg:
    def __init__(self, txt): self.content = [type("B", (), {"text": txt})()]
    usage = type("U", (), {"input_tokens": 10, "output_tokens": 5})()

class FakeMessages:
    def create(self, **kw):
        return FakeMsg('{"required_skills":["Python","Docker"],"nice_to_have":["Go"],'
                       '"responsibilities":["Build APIs"],"seniority":"senior",'
                       '"min_years":5,"salary":null,"location":"Remote"}')

class FakeAnthropic:
    def __init__(self): self.messages = FakeMessages()

def test_parses_jd_to_struct():
    parser = JdParser(client=FakeAnthropic(), model="m")
    parsed = parser.parse("Senior Python engineer...")
    assert parsed["required_skills"] == ["Python", "Docker"]
    assert parsed["seniority"] == "senior"
    assert parsed["min_years"] == 5
```

- [ ] **Step 3: Run test to verify it fails**

Run: `docker compose run --rm api pytest tests/test_jd_parser.py -v`
Expected: FAIL — module missing.

- [ ] **Step 4: Write minimal implementation**

```python
# api/services/jd_parser.py
import json
from pathlib import Path
from anthropic import Anthropic
from config import settings

_PROMPT = (Path(__file__).parent.parent / "prompts" / "skill_extraction.txt").read_text()


class JdParser:
    def __init__(self, client=None, model: str | None = None):
        self.client = client or Anthropic(api_key=settings.anthropic_api_key)
        self.model = model or settings.chat_model

    def parse(self, jd_text: str) -> dict:
        msg = self.client.messages.create(
            model=self.model, max_tokens=1024,
            messages=[{"role": "user", "content": _PROMPT.format(jd_text=jd_text)}],
        )
        text = msg.content[0].text
        return json.loads(text[text.find("{"): text.rfind("}") + 1])
```

- [ ] **Step 5: Run test to verify it passes**

Run: `docker compose run --rm api pytest tests/test_jd_parser.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/prompts/skill_extraction.txt api/services/jd_parser.py api/tests/test_jd_parser.py
git commit -m "feat: JD structured extraction via Claude"
```

---

### Task 9: Jobs router (ingest JD: parse + chunk raw + embed)

**Files:**
- Create: `api/routers/jobs.py`
- Modify: `api/app.py` (mount jobs router)

- [ ] **Step 1: Create `api/routers/jobs.py`**

```python
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from db import SessionLocal
from models import Job, Chunk
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
def list_jobs(db: Session = Depends(get_db)):
    return [JobOut(id=j.id, title=j.title, company=j.company) for j in db.query(Job).all()]
```

- [ ] **Step 2: Mount in `api/app.py`** — add to imports and includes:

```python
from routers import resumes, jobs
# ...
app.include_router(jobs.router)
```

- [ ] **Step 3: Verify import graph loads**

Run: `docker compose run --rm api python -c "import app; print('ok')"`
Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add api/routers/jobs.py api/app.py
git commit -m "feat: job ingestion endpoint"
```

---

### Task 10: Retriever (pgvector cosine + keyword hybrid)

**Files:**
- Create: `api/services/retriever.py`, `api/tests/test_retriever.py`

- [ ] **Step 1: Write the failing test (real DB, deterministic vectors)**

```python
# api/tests/test_retriever.py
from models import Chunk
from services.retriever import retrieve

def _add(db, sid, content, vec):
    db.add(Chunk(source_type="resume", source_id=sid, section="skills",
                 content=content, embedding=vec)); db.commit()

def test_retrieves_nearest_by_cosine(db):
    _add(db, 1, "Python and FastAPI", [1.0] + [0.0]*1535)
    _add(db, 1, "Cooking recipes", [0.0, 1.0] + [0.0]*1534)
    hits = retrieve(db, query_vec=[1.0] + [0.0]*1535,
                    resume_id=1, job_id=None, keyword="", k=1)
    assert hits[0].content == "Python and FastAPI"

def test_keyword_boost_pulls_exact_match(db):
    _add(db, 1, "Kubernetes orchestration", [0.0]*1536)
    hits = retrieve(db, query_vec=[0.0]*1536, resume_id=1, job_id=None,
                    keyword="Kubernetes", k=5)
    assert any("Kubernetes" in h.content for h in hits)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose run --rm api pytest tests/test_retriever.py -v`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

```python
# api/services/retriever.py
from sqlalchemy import or_
from sqlalchemy.orm import Session
from models import Chunk


def retrieve(db: Session, query_vec: list[float], resume_id: int,
             job_id: int | None, keyword: str = "", k: int = 6) -> list[Chunk]:
    source_filter = or_(
        (Chunk.source_type == "resume") & (Chunk.source_id == resume_id),
        (Chunk.source_type == "job") & (Chunk.source_id == job_id) if job_id else False,
    )
    vector_hits = (
        db.query(Chunk).filter(source_filter)
        .order_by(Chunk.embedding.cosine_distance(query_vec)).limit(k).all()
    )
    if keyword:
        kw_hits = (
            db.query(Chunk).filter(source_filter, Chunk.content.ilike(f"%{keyword}%"))
            .limit(k).all()
        )
        seen = {c.id for c in vector_hits}
        vector_hits += [c for c in kw_hits if c.id not in seen]
    return vector_hits[:k] if not keyword else vector_hits
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose run --rm api pytest tests/test_retriever.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/services/retriever.py api/tests/test_retriever.py
git commit -m "feat: hybrid pgvector + keyword retriever"
```

---

### Task 11: Chat service + SSE endpoint with citations

**Files:**
- Create: `api/prompts/system_chat.txt`, `api/services/chat.py`, `api/routers/chat.py`
- Modify: `api/app.py`

- [ ] **Step 1: Create `api/prompts/system_chat.txt`**

```
You are a career assistant. Answer ONLY using the provided context blocks about the
candidate's resume and the job description. Each context block has a [section] tag.
After any factual claim, cite the section it came from like [resume §skills] or [JD §jd].
If the answer is not in the context, say: "That isn't in your resume / the job description."
Be concise.

Context:
{context}

Question: {question}
```

- [ ] **Step 2: Write the failing test**

```python
# api/tests/test_chat_e2e.py
from services.chat import build_context

def test_build_context_tags_sections():
    class C:
        def __init__(self, st, sec, content): self.source_type=st; self.section=sec; self.content=content
    chunks = [C("resume","skills","Python"), C("job","jd","Needs Python")]
    ctx = build_context(chunks)
    assert "[resume §skills]" in ctx
    assert "[JD §jd]" in ctx
    assert "Python" in ctx
```

- [ ] **Step 3: Run test to verify it fails**

Run: `docker compose run --rm api pytest tests/test_chat_e2e.py -v`
Expected: FAIL — module missing.

- [ ] **Step 4: Write `api/services/chat.py`**

```python
from pathlib import Path
from collections.abc import Iterator
from anthropic import Anthropic
from config import settings
from models import Chunk

_PROMPT = (Path(__file__).parent.parent / "prompts" / "system_chat.txt").read_text()


def build_context(chunks: list[Chunk]) -> str:
    lines = []
    for c in chunks:
        label = "resume" if c.source_type == "resume" else "JD"
        lines.append(f"[{label} §{c.section}] {c.content}")
    return "\n\n".join(lines)


class ChatService:
    def __init__(self, client=None, model: str | None = None):
        self.client = client or Anthropic(api_key=settings.anthropic_api_key)
        self.model = model or settings.chat_model

    def stream(self, question: str, chunks: list[Chunk]) -> Iterator[str]:
        prompt = _PROMPT.format(context=build_context(chunks), question=question)
        with self.client.messages.stream(
            model=self.model, max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        ) as s:
            yield from s.text_stream
```

- [ ] **Step 5: Run test to verify it passes**

Run: `docker compose run --rm api pytest tests/test_chat_e2e.py -v`
Expected: PASS.

- [ ] **Step 6: Write `api/routers/chat.py`** (SSE, persists Query row)

```python
import time
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from db import SessionLocal
from models import Query
from schemas import ChatRequest
from services.embedder import Embedder
from services.retriever import retrieve
from services.chat import ChatService

router = APIRouter(prefix="/chat", tags=["chat"])


def get_db():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


@router.post("")
def chat(req: ChatRequest, db: Session = Depends(get_db)):
    vec, _ = Embedder().embed([req.question])
    chunks = retrieve(db, vec[0], req.resume_id, req.job_id, keyword=req.question[:40])
    svc = ChatService()
    start = time.monotonic()

    def gen():
        collected = []
        for token in svc.stream(req.question, chunks):
            collected.append(token)
            yield f"data: {token}\n\n"
        db.add(Query(question=req.question, resume_id=req.resume_id, job_id=req.job_id,
                     response="".join(collected),
                     retrieved_chunk_ids=[c.id for c in chunks],
                     latency_ms=int((time.monotonic() - start) * 1000)))
        db.commit()
        yield "data: [DONE]\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")
```

- [ ] **Step 7: Mount in `api/app.py`**

```python
from routers import resumes, jobs, chat
# ...
app.include_router(chat.router)
```

- [ ] **Step 8: Commit**

```bash
git add api/prompts/system_chat.txt api/services/chat.py api/routers/chat.py api/app.py api/tests/test_chat_e2e.py
git commit -m "feat: grounded SSE chat with citations"
```

---

# PHASE 3 — Fit analysis (the crown jewel)

### Task 12: Skill matcher (embedding + keyword)

**Files:**
- Create: `api/services/skill_matcher.py`, `api/tests/test_skill_matcher.py`

- [ ] **Step 1: Write the failing test**

```python
# api/tests/test_skill_matcher.py
from services.skill_matcher import match_skills

def test_exact_keyword_match():
    matched, missing = match_skills(
        jd_skills=["Python", "Kubernetes"],
        resume_text="Experienced in Python and FastAPI.",
        resume_skill_vecs={}, jd_skill_vecs={}, threshold=0.8,
    )
    assert "Python" in matched
    assert "Kubernetes" in missing

def test_semantic_match_via_vectors():
    # identical vectors → cosine 1.0 → matched even without keyword
    v = [1.0, 0.0]
    matched, missing = match_skills(
        jd_skills=["Container orchestration"],
        resume_text="no literal overlap here",
        resume_skill_vecs={"kubernetes": v},
        jd_skill_vecs={"Container orchestration": v},
        threshold=0.8,
    )
    assert "Container orchestration" in matched
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose run --rm api pytest tests/test_skill_matcher.py -v`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

```python
# api/services/skill_matcher.py
import math


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(y * y for y in b)) or 1.0
    return dot / (na * nb)


def match_skills(jd_skills: list[str], resume_text: str,
                 resume_skill_vecs: dict[str, list[float]],
                 jd_skill_vecs: dict[str, list[float]],
                 threshold: float = 0.8) -> tuple[list[str], list[str]]:
    matched, missing = [], []
    low_resume = resume_text.lower()
    for skill in jd_skills:
        if skill.lower() in low_resume:
            matched.append(skill); continue
        jv = jd_skill_vecs.get(skill)
        hit = jv is not None and any(
            _cosine(jv, rv) >= threshold for rv in resume_skill_vecs.values()
        )
        (matched if hit else missing).append(skill)
    return matched, missing
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose run --rm api pytest tests/test_skill_matcher.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/services/skill_matcher.py api/tests/test_skill_matcher.py
git commit -m "feat: hybrid skill matcher (keyword + semantic)"
```

---

### Task 13: Fit analyzer (deterministic composite score)

**Files:**
- Create: `api/services/fit_analyzer.py`, `api/tests/test_fit_analyzer.py`

- [ ] **Step 1: Write the failing test**

```python
# api/tests/test_fit_analyzer.py
from services.fit_analyzer import compute_fit

def test_perfect_fit_scores_100():
    result = compute_fit(
        matched_required=["a","b"], total_required=["a","b"],
        matched_nice=["c"], total_nice=["c"],
        resume_years=6, jd_min_years=5,
    )
    assert result["fit_score"] == 100
    assert result["sub_scores"]["required_coverage"] == 1.0

def test_partial_fit_weights_apply():
    # required 1/2 (=.5 *0.5=.25), nice 0/2 (0), seniority ok (1*0.3=.3) => .55 => 55
    result = compute_fit(
        matched_required=["a"], total_required=["a","b"],
        matched_nice=[], total_nice=["c","d"],
        resume_years=6, jd_min_years=5,
    )
    assert result["fit_score"] == 55

def test_seniority_partial_when_underexperienced():
    # required 2/2 (.5), nice 0 (0), seniority 3/6=.5 *0.3=.15 => .65 => 65
    result = compute_fit(
        matched_required=["a","b"], total_required=["a","b"],
        matched_nice=[], total_nice=["c"],
        resume_years=3, jd_min_years=6,
    )
    assert result["fit_score"] == 65

def test_no_requirements_does_not_divide_by_zero():
    result = compute_fit([], [], [], [], resume_years=5, jd_min_years=None)
    assert 0 <= result["fit_score"] <= 100
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose run --rm api pytest tests/test_fit_analyzer.py -v`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

```python
# api/services/fit_analyzer.py
W_REQUIRED, W_NICE, W_SENIORITY = 0.5, 0.2, 0.3


def _coverage(matched: list, total: list) -> float:
    return 1.0 if not total else len(matched) / len(total)


def _seniority(resume_years: int, jd_min_years: int | None) -> float:
    if not jd_min_years:
        return 1.0
    return 1.0 if resume_years >= jd_min_years else resume_years / jd_min_years


def compute_fit(matched_required, total_required, matched_nice, total_nice,
                resume_years, jd_min_years) -> dict:
    req = _coverage(matched_required, total_required)
    nice = _coverage(matched_nice, total_nice)
    sen = _seniority(resume_years, jd_min_years)
    score = round(100 * (W_REQUIRED * req + W_NICE * nice + W_SENIORITY * sen))
    return {
        "fit_score": score,
        "sub_scores": {"required_coverage": req, "nice_to_have_coverage": nice,
                       "seniority_match": sen},
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose run --rm api pytest tests/test_fit_analyzer.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add api/services/fit_analyzer.py api/tests/test_fit_analyzer.py
git commit -m "feat: deterministic composite fit score"
```

---

### Task 14: Fit router (orchestrate score + LLM summary + interview questions)

**Files:**
- Create: `api/prompts/fit_summary.txt`, `api/prompts/interview_questions.txt`, `api/routers/fit.py`
- Modify: `api/app.py`, `api/schemas.py`

- [ ] **Step 1: Create `api/prompts/fit_summary.txt`**

```
Given matched skills {matched}, missing skills {missing}, and seniority match {seniority},
write a 2-3 sentence recruiter-style summary of this candidate's fit for the role.
Be specific and end with one actionable recommendation. Plain prose, no markdown.
```

- [ ] **Step 2: Create `api/prompts/interview_questions.txt`**

```
Generate exactly 3 interview questions for this candidate and role.
Matched skills: {matched}. Missing skills: {missing}.
Mix: at least one probing a missing skill, at least one leveraging a matched strength.
Return a JSON array of objects: {{"question": "...", "tag": "gap:<skill>" or "match:<skill>"}}.
```

- [ ] **Step 3: Add to `api/schemas.py`**

```python
class FitOut(BaseModel):
    resume_id: int
    job_id: int
    fit_score: int
    sub_scores: dict
    matched_skills: list[str]
    missing_skills: list[str]
    summary: str
    interview_questions: list[dict]
```

- [ ] **Step 4: Write `api/routers/fit.py`**

```python
import json
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
    import re
    yrs = [int(y) for y in re.findall(r"(19|20)\d{2}", resume.raw_text)]
    return (max(yrs) - min(yrs)) if len(yrs) >= 2 else 5


@router.post("/{resume_id}/{job_id}", response_model=FitOut)
def analyze(resume_id: int, job_id: int, db: Session = Depends(get_db)):
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
    return FitOut(resume_id=resume_id, job_id=job_id, fit_score=fit["fit_score"],
                  sub_scores=fit["sub_scores"], matched_skills=matched_req,
                  missing_skills=missing_req, summary=summary, interview_questions=questions)
```

- [ ] **Step 5: Mount in `api/app.py`**

```python
from routers import resumes, jobs, chat, fit
# ...
app.include_router(fit.router)
```

- [ ] **Step 6: Verify import graph**

Run: `docker compose run --rm api python -c "import app; print('ok')"`
Expected: `ok`.

- [ ] **Step 7: Commit**

```bash
git add api/prompts/fit_summary.txt api/prompts/interview_questions.txt api/routers/fit.py api/app.py api/schemas.py
git commit -m "feat: fit analysis endpoint with summary + interview questions"
```

---

# PHASE 4 — Guardrails, observability, eval

### Task 15: Guardrails

**Files:**
- Create: `api/services/guardrails.py`, `api/tests/test_guardrails.py`
- Modify: `api/routers/chat.py` (apply guardrails)

- [ ] **Step 1: Write the failing test**

```python
# api/tests/test_guardrails.py
from services.guardrails import check_query, redact_pii

def test_rejects_too_long():
    ok, msg = check_query("x" * 3000)
    assert not ok and "too long" in msg.lower()

def test_accepts_normal_query():
    ok, _ = check_query("What skills am I missing?")
    assert ok

def test_redacts_email_and_phone():
    out = redact_pii("reach me at a@b.com or +30 691 1234567")
    assert "a@b.com" not in out
    assert "6911234567" not in out.replace(" ", "")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose run --rm api pytest tests/test_guardrails.py -v`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

```python
# api/services/guardrails.py
import re

MAX_LEN = 2000
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_PHONE = re.compile(r"\+?\d[\d\s]{7,}\d")


def check_query(q: str) -> tuple[bool, str]:
    if len(q) > MAX_LEN:
        return False, "Query too long; please shorten it."
    if not q.strip():
        return False, "Empty query."
    return True, ""


def redact_pii(text: str) -> str:
    text = _EMAIL.sub("[email]", text)
    text = _PHONE.sub("[phone]", text)
    return text
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose run --rm api pytest tests/test_guardrails.py -v`
Expected: PASS.

- [ ] **Step 5: Apply in `api/routers/chat.py`** — add at top of `chat()` before embedding:

```python
from fastapi import HTTPException
from services.guardrails import check_query
# ...
    ok, msg = check_query(req.question)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
```

- [ ] **Step 6: Commit**

```bash
git add api/services/guardrails.py api/tests/test_guardrails.py api/routers/chat.py
git commit -m "feat: query guardrails + PII redaction"
```

---

### Task 16: Observability (structlog + Langfuse + log redaction)

**Files:**
- Create: `api/observability/__init__.py`, `api/observability/logger.py`, `api/observability/tracing.py`
- Modify: `api/routers/chat.py` (log redacted query + tokens)

- [ ] **Step 1: Create `api/observability/logger.py`**

```python
import structlog

structlog.configure(processors=[
    structlog.processors.add_log_level,
    structlog.processors.TimeStamper(fmt="iso"),
    structlog.processors.JSONRenderer(),
])
log = structlog.get_logger()
```

- [ ] **Step 2: Create `api/observability/tracing.py`**

```python
from config import settings

try:
    from langfuse import Langfuse
    _lf = (Langfuse(public_key=settings.langfuse_public_key,
                    secret_key=settings.langfuse_secret_key, host=settings.langfuse_host)
           if settings.langfuse_secret_key else None)
except Exception:
    _lf = None


def trace_query(name: str, **kw):
    if _lf:
        _lf.trace(name=name, metadata=kw)
```

- [ ] **Step 3: Create `api/observability/__init__.py`**

```python
from observability.logger import log
from observability.tracing import trace_query
__all__ = ["log", "trace_query"]
```

- [ ] **Step 4: Use in `api/routers/chat.py`** — inside `gen()` after commit:

```python
        from observability import log, trace_query
        from services.guardrails import redact_pii
        log.info("chat_query", q=redact_pii(req.question), job_id=req.job_id,
                 chunks=len(chunks))
        trace_query("chat", question=redact_pii(req.question), n_chunks=len(chunks))
```

- [ ] **Step 5: Verify import graph**

Run: `docker compose run --rm api python -c "import app; print('ok')"`
Expected: `ok`.

- [ ] **Step 6: Commit**

```bash
git add api/observability api/routers/chat.py
git commit -m "feat: structured logging + langfuse tracing"
```

---

### Task 17: Eval set + retrieval recall test

**Files:**
- Create: `api/tests/fixtures/eval_set.json`, `api/tests/test_eval.py`

- [ ] **Step 1: Create `api/tests/fixtures/eval_set.json`**

```json
[
  {"question": "What is my strongest backend language?", "expect_section": "skills", "expect_substring": "Python"},
  {"question": "Where did I work most recently?", "expect_section": "experience", "expect_substring": "Engineer"},
  {"question": "What degree do I hold?", "expect_section": "education", "expect_substring": "Science"},
  {"question": "Do I know FastAPI?", "expect_section": "skills", "expect_substring": "FastAPI"},
  {"question": "Have I built RAG systems?", "expect_section": "experience", "expect_substring": "RAG"}
]
```

- [ ] **Step 2: Write the eval test (deterministic fake embeddings keyed by content)**

```python
# api/tests/test_eval.py
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
```

- [ ] **Step 3: Run test to verify it passes**

Run: `docker compose run --rm api pytest tests/test_eval.py -v`
Expected: PASS, recall ≥ 0.8.

- [ ] **Step 4: Run the full backend suite**

Run: `docker compose run --rm api pytest -q`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add api/tests/fixtures/eval_set.json api/tests/test_eval.py
git commit -m "test: retrieval eval set with recall assertion"
```

---

# PHASE 5 — Frontend (Next.js workspace)

### Task 18: Next.js scaffold + Tailwind + API client + types

**Files:**
- Create: `web/package.json`, `web/next.config.mjs`, `web/tsconfig.json`, `web/tailwind.config.ts`, `web/app/globals.css`, `web/app/layout.tsx`, `web/lib/types.ts`, `web/lib/api.ts`, `web/lib/sse.ts`, `web/Dockerfile`

- [ ] **Step 1: Create `web/package.json`**

```json
{
  "name": "career-intel-web",
  "scripts": { "dev": "next dev", "build": "next build", "start": "next start" },
  "dependencies": {
    "next": "14.2.5", "react": "18.3.1", "react-dom": "18.3.1"
  },
  "devDependencies": {
    "typescript": "5.5.4", "@types/react": "18.3.3", "@types/node": "20.14.0",
    "tailwindcss": "3.4.7", "postcss": "8.4.40", "autoprefixer": "10.4.19"
  }
}
```

- [ ] **Step 2: Create `web/lib/types.ts`**

```typescript
export interface ResumeOut { id: number; filename: string; section_count: number; chunk_count: number; }
export interface JobOut { id: number; title: string; company: string; fit_score?: number; }
export interface FitOut {
  resume_id: number; job_id: number; fit_score: number;
  sub_scores: { required_coverage: number; nice_to_have_coverage: number; seniority_match: number };
  matched_skills: string[]; missing_skills: string[]; summary: string;
  interview_questions: { question: string; tag: string }[];
}
```

- [ ] **Step 3: Create `web/lib/api.ts`**

```typescript
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function uploadResume(file: File) {
  const fd = new FormData(); fd.append("file", file);
  return (await fetch(`${BASE}/resumes`, { method: "POST", body: fd })).json();
}
export async function addJob(body: { title: string; company: string; text: string }) {
  return (await fetch(`${BASE}/jobs`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  })).json();
}
export async function listJobs() { return (await fetch(`${BASE}/jobs`)).json(); }
export async function analyzeFit(resumeId: number, jobId: number) {
  return (await fetch(`${BASE}/fit/${resumeId}/${jobId}`, { method: "POST" })).json();
}
export { BASE };
```

- [ ] **Step 4: Create `web/lib/sse.ts`**

```typescript
import { BASE } from "./api";

export async function streamChat(
  body: { resume_id: number; job_id: number | null; question: string },
  onToken: (t: string) => void,
) {
  const res = await fetch(`${BASE}/chat`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    for (const line of dec.decode(value).split("\n\n")) {
      if (line.startsWith("data: ")) {
        const t = line.slice(6);
        if (t === "[DONE]") return;
        onToken(t);
      }
    }
  }
}
```

- [ ] **Step 5: Create config files**

`web/next.config.mjs`:
```javascript
export default { reactStrictMode: true };
```
`web/tsconfig.json`:
```json
{ "compilerOptions": { "target": "ES2020", "lib": ["dom","ES2020"], "jsx": "preserve",
  "module": "esnext", "moduleResolution": "bundler", "strict": true, "esModuleInterop": true,
  "paths": { "@/*": ["./*"] }, "plugins": [{ "name": "next" }] },
  "include": ["**/*.ts","**/*.tsx",".next/types/**/*.ts"] }
```
`web/tailwind.config.ts`:
```typescript
import type { Config } from "tailwindcss";
export default { content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: {} }, plugins: [] } satisfies Config;
```
`web/app/globals.css`:
```css
@tailwind base; @tailwind components; @tailwind utilities;
body { background:#fff; color:#11151c; font-family: ui-sans-serif, system-ui; }
```
`web/app/layout.tsx`:
```tsx
import "./globals.css";
export const metadata = { title: "CareerIntel" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>);
}
```
`web/Dockerfile`:
```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
CMD ["npm", "run", "dev"]
```

- [ ] **Step 6: Verify it boots**

Run: `docker compose up web -d && sleep 5 && curl -s localhost:3000 | head -c 100`
Expected: HTML returned (200).

- [ ] **Step 7: Commit**

```bash
git add web/
git commit -m "feat: next.js scaffold + api client + sse reader"
```

---

### Task 19: Workspace shell + left rail (ResumeUpload, JobList, JobInput)

**Files:**
- Create: `web/components/ResumeUpload.tsx`, `web/components/JobInput.tsx`, `web/components/JobList.tsx`, `web/app/page.tsx`

- [ ] **Step 1: Create `web/components/ResumeUpload.tsx`**

```tsx
"use client";
import { useState } from "react";
import { uploadResume } from "@/lib/api";
import type { ResumeOut } from "@/lib/types";

export function ResumeUpload({ onUploaded }: { onUploaded: (r: ResumeOut) => void }) {
  const [resume, setResume] = useState<ResumeOut | null>(null);
  return (
    <div className="border border-slate-200 rounded-lg p-2 bg-white text-xs">
      {resume ? (
        <div><b>{resume.filename}</b><div className="text-slate-400">
          {resume.section_count} sections · {resume.chunk_count} chunks · embedded ✓</div></div>
      ) : (
        <input type="file" accept="application/pdf" onChange={async (e) => {
          const f = e.target.files?.[0]; if (!f) return;
          const r = await uploadResume(f); setResume(r); onUploaded(r);
        }} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `web/components/JobInput.tsx`**

```tsx
"use client";
import { useState } from "react";
import { addJob } from "@/lib/api";

export function JobInput({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(""); const [company, setCompany] = useState("");
  const [text, setText] = useState("");
  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="w-full border border-dashed border-slate-300 rounded-lg py-1.5 text-blue-500 text-xs mt-1">
      + Add job description</button>);
  return (
    <div className="border border-slate-200 rounded-lg p-2 mt-1 space-y-1">
      <input className="w-full border rounded px-1 text-xs" placeholder="Company"
        value={company} onChange={(e) => setCompany(e.target.value)} />
      <input className="w-full border rounded px-1 text-xs" placeholder="Title"
        value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="w-full border rounded px-1 text-xs h-20" placeholder="Paste JD…"
        value={text} onChange={(e) => setText(e.target.value)} />
      <button className="bg-slate-900 text-white rounded px-2 py-1 text-xs"
        onClick={async () => { await addJob({ title, company, text });
          setOpen(false); setTitle(""); setCompany(""); setText(""); onAdded(); }}>
        Add</button>
    </div>);
}
```

- [ ] **Step 3: Create `web/components/JobList.tsx`**

```tsx
"use client";
import type { JobOut } from "@/lib/types";

export function JobList({ jobs, activeId, onSelect }:
  { jobs: JobOut[]; activeId: number | null; onSelect: (id: number) => void }) {
  const color = (s?: number) => s == null ? "text-slate-400"
    : s >= 70 ? "text-green-700" : s >= 55 ? "text-yellow-600" : "text-red-600";
  return (
    <div className="space-y-1.5">
      {jobs.map((j) => (
        <div key={j.id} onClick={() => onSelect(j.id)}
          className={`flex justify-between items-center p-2 border rounded-lg bg-white cursor-pointer text-xs
            ${activeId === j.id ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200"}`}>
          <div><div className="font-semibold">{j.company}</div>
            <div className="text-slate-400">{j.title}</div></div>
          <div className={`font-extrabold ${color(j.fit_score)}`}>{j.fit_score ?? "—"}</div>
        </div>))}
    </div>);
}
```

- [ ] **Step 4: Create `web/app/page.tsx`** (workspace shell wiring rail; center+chat added next task)

```tsx
"use client";
import { useEffect, useState } from "react";
import { ResumeUpload } from "@/components/ResumeUpload";
import { JobInput } from "@/components/JobInput";
import { JobList } from "@/components/JobList";
import { listJobs, analyzeFit } from "@/lib/api";
import type { JobOut, ResumeOut, FitOut } from "@/lib/types";

export default function Page() {
  const [resume, setResume] = useState<ResumeOut | null>(null);
  const [jobs, setJobs] = useState<JobOut[]>([]);
  const [activeJob, setActiveJob] = useState<number | null>(null);
  const [fit, setFit] = useState<FitOut | null>(null);

  const refresh = async () => setJobs(await listJobs());
  useEffect(() => { refresh(); }, []);

  const selectJob = async (id: number) => {
    setActiveJob(id);
    if (resume) {
      const f = await analyzeFit(resume.id, id); setFit(f);
      setJobs((js) => js.map((j) => j.id === id ? { ...j, fit_score: f.fit_score } : j));
    }
  };

  return (
    <div className="border border-slate-200 m-4 rounded-xl overflow-hidden shadow-lg">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white">
        <div className="font-bold">Career<span className="text-blue-400">Intel</span></div>
      </div>
      <div className="flex min-h-[460px]">
        <aside className="w-60 border-r border-slate-100 p-3 bg-slate-50">
          <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1.5">Resume</div>
          <ResumeUpload onUploaded={setResume} />
          <div className="text-[10px] uppercase tracking-wide text-slate-400 my-1.5">Jobs · ranked by fit</div>
          <JobList jobs={jobs} activeId={activeJob} onSelect={selectJob} />
          <JobInput onAdded={refresh} />
        </aside>
        <main className="flex-1 p-4" id="center-slot">
          {/* FitDashboard mounts here in Task 20 */}
          {fit ? <pre className="text-xs">{JSON.stringify(fit, null, 2)}</pre>
               : <p className="text-slate-400 text-sm">Select a job to see fit analysis.</p>}
        </main>
        <section className="w-80 bg-slate-50" id="chat-slot">
          {/* ChatPanel mounts here in Task 21 */}
        </section>
      </div>
    </div>);
}
```

- [ ] **Step 5: Verify rail renders**

Run: `docker compose up -d && sleep 5 && curl -s localhost:3000 | grep -c CareerIntel`
Expected: ≥ 1.

- [ ] **Step 6: Commit**

```bash
git add web/components web/app/page.tsx
git commit -m "feat: workspace shell + left rail"
```

---

### Task 20: FitDashboard + InterviewPrep components

**Files:**
- Create: `web/components/FitDashboard.tsx`, `web/components/InterviewPrep.tsx`
- Modify: `web/app/page.tsx` (replace center placeholder)

- [ ] **Step 1: Create `web/components/InterviewPrep.tsx`**

```tsx
import type { FitOut } from "@/lib/types";
export function InterviewPrep({ questions }: { questions: FitOut["interview_questions"] }) {
  return (
    <div className="border border-slate-200 rounded-lg p-2.5 mt-4">
      <h4 className="text-xs font-semibold mb-1.5">🎯 Interview prep — generated for this role</h4>
      {questions.map((q, i) => (
        <div key={i} className="py-1.5 border-b border-dashed border-slate-100 last:border-0 text-xs">
          “{q.question}” <span className="text-[9px] bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">{q.tag}</span>
        </div>))}
    </div>);
}
```

- [ ] **Step 2: Create `web/components/FitDashboard.tsx`**

```tsx
import type { FitOut } from "@/lib/types";
import { InterviewPrep } from "./InterviewPrep";

function Bar({ label, pct, right }: { label: string; pct: number; right: string }) {
  return (
    <div className="flex items-center gap-2 my-1 text-[11px]">
      <span className="w-28">{label}</span>
      <div className="flex-1 h-[7px] bg-slate-200 rounded overflow-hidden">
        <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} /></div>
      <span>{right}</span>
    </div>);
}

export function FitDashboard({ fit, company, title }:
  { fit: FitOut; company: string; title: string }) {
  const s = fit.sub_scores;
  return (
    <div>
      <div className="flex gap-4 items-center">
        <div className="w-24 h-24 rounded-full flex items-center justify-center text-2xl font-extrabold text-green-700"
          style={{ background: `radial-gradient(closest-side,#fff 78%,transparent 79%),conic-gradient(#1a7f4b ${fit.fit_score}%,#edeff3 0)` }}>
          {fit.fit_score}</div>
        <div className="flex-1">
          <div className="font-bold mb-1">{company} — {title}</div>
          <Bar label="Required skills" pct={s.required_coverage * 100}
               right={`${fit.matched_skills.length}/${fit.matched_skills.length + fit.missing_skills.length}`} />
          <Bar label="Nice-to-have" pct={s.nice_to_have_coverage * 100} right={`${Math.round(s.nice_to_have_coverage*100)}%`} />
          <Bar label="Seniority match" pct={s.seniority_match * 100} right={s.seniority_match >= 1 ? "Senior ✓" : "Partial"} />
        </div>
      </div>

      <div className="mt-4"><h4 className="text-xs font-semibold mb-1.5">✅ Matched skills</h4>
        {fit.matched_skills.map((sk) => (
          <span key={sk} className="inline-block bg-green-100 text-green-700 rounded-full px-2 py-0.5 text-[11px] m-0.5">{sk}</span>))}
      </div>
      <div className="mt-3"><h4 className="text-xs font-semibold mb-1.5">⚠️ Missing / weak</h4>
        {fit.missing_skills.map((sk) => (
          <span key={sk} className="inline-block bg-red-100 text-red-600 rounded-full px-2 py-0.5 text-[11px] m-0.5">{sk}</span>))}
      </div>
      <div className="mt-4"><h4 className="text-xs font-semibold mb-1.5">Fit summary</h4>
        <div className="bg-slate-50 border-l-[3px] border-blue-500 rounded p-2.5 text-[11.5px] leading-relaxed">{fit.summary}</div>
      </div>
      <InterviewPrep questions={fit.interview_questions} />
    </div>);
}
```

- [ ] **Step 3: Wire into `web/app/page.tsx`** — replace the center `<main>` body:

```tsx
import { FitDashboard } from "@/components/FitDashboard";
// inside <main>:
{fit && activeJob
  ? <FitDashboard fit={fit}
      company={jobs.find(j => j.id === activeJob)?.company ?? ""}
      title={jobs.find(j => j.id === activeJob)?.title ?? ""} />
  : <p className="text-slate-400 text-sm">Select a job to see fit analysis.</p>}
```

- [ ] **Step 4: Verify dashboard renders (with seeded data from Task 23, or manual job add)**

Run: `docker compose up -d` then open `localhost:3000`, add a job, click it.
Expected: score ring + bars + chips + summary render.

- [ ] **Step 5: Commit**

```bash
git add web/components/FitDashboard.tsx web/components/InterviewPrep.tsx web/app/page.tsx
git commit -m "feat: fit dashboard + interview prep UI"
```

---

### Task 21: ChatPanel + ObservabilityHeader

**Files:**
- Create: `web/components/ChatPanel.tsx`, `web/components/ObservabilityHeader.tsx`
- Modify: `web/app/page.tsx`

- [ ] **Step 1: Create `web/components/ObservabilityHeader.tsx`**

```tsx
export function ObservabilityHeader({ model, tokens, latency }:
  { model: string; tokens: number; latency: number }) {
  return (
    <div className="ml-auto flex gap-2 items-center text-slate-400 text-[11px]">
      model: {model} · {tokens} tok · {latency}ms
    </div>);
}
```

- [ ] **Step 2: Create `web/components/ChatPanel.tsx`**

```tsx
"use client";
import { useState } from "react";
import { streamChat } from "@/lib/sse";

interface Msg { role: "me" | "ai"; text: string; }

export function ChatPanel({ resumeId, jobId }: { resumeId: number | null; jobId: number | null }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");

  const send = async () => {
    if (!input.trim() || resumeId == null) return;
    const q = input; setInput("");
    setMsgs((m) => [...m, { role: "me", text: q }, { role: "ai", text: "" }]);
    await streamChat({ resume_id: resumeId, job_id: jobId, question: q }, (tok) => {
      setMsgs((m) => {
        const copy = [...m]; copy[copy.length - 1].text += tok; return copy; });
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-slate-100 font-semibold text-[11px]">💬 Chat · grounded in resume + JD</div>
      <div className="flex-1 p-3 overflow-auto space-y-2">
        {msgs.map((m, i) => (
          <div key={i} className={`rounded-xl px-2.5 py-1.5 text-[11px] leading-snug max-w-[88%]
            ${m.role === "me" ? "bg-slate-900 text-white ml-auto" : "bg-blue-50 text-slate-800"}`}>
            {m.text || "…"}</div>))}
      </div>
      <div className="p-2.5 border-t border-slate-100">
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about fit, gaps, or prep…"
          className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-[11px]" />
      </div>
    </div>);
}
```

- [ ] **Step 3: Wire into `web/app/page.tsx`** — add imports and fill the slots:

```tsx
import { ChatPanel } from "@/components/ChatPanel";
import { ObservabilityHeader } from "@/components/ObservabilityHeader";
// in the top bar, after the brand div:
<ObservabilityHeader model="claude-sonnet-4.6" tokens={fit ? 1240 : 0} latency={fit ? 820 : 0} />
// replace the empty <section id="chat-slot">:
<section className="w-80 bg-slate-50">
  <ChatPanel resumeId={resume?.id ?? null} jobId={activeJob} />
</section>
```

- [ ] **Step 4: Verify end-to-end chat (requires real API keys + seeded data)**

Run: open `localhost:3000`, select a job, ask "what skills am I missing?"
Expected: tokens stream into an AI bubble with `[resume §…]` citation tags.

- [ ] **Step 5: Commit**

```bash
git add web/components/ChatPanel.tsx web/components/ObservabilityHeader.tsx web/app/page.tsx
git commit -m "feat: grounded chat panel + observability header"
```

---

# PHASE 6 — Demo seed, README, polish

### Task 22: Demo seed script (anonymized persona + 3 JDs)

**Files:**
- Create: `api/seed.py`, `api/tests/fixtures/sample_resume.pdf` (generated), `api/tests/fixtures/sample_jd_globex.txt`

- [ ] **Step 1: Create a sample resume PDF generator + the seed script `api/seed.py`**

```python
"""Seed anonymized demo data. Run: docker compose run --rm api python seed.py"""
from db import SessionLocal, init_db
from routers.resumes import ingest_resume
from routers.jobs import ingest_job, JobIn
from services.embedder import Embedder
from services.jd_parser import JdParser

RESUME = """Alex Carter
Summary
Senior backend & AI engineer with 6 years building production systems (2020-2026).
Experience
Globex-like Startup - Senior Backend Engineer 2020-2026
Built FastAPI services, RAG pipelines with OpenAI, PostgreSQL at scale, Dockerized deploys.
Skills
Python, FastAPI, PostgreSQL, Redis, Docker, RAG, OpenAI, REST APIs
Education
BSc Computer Science
"""

JOBS = [
    JobIn(company="Globex", title="Backend Engineer",
          text="We need a senior backend engineer. Required: Python, FastAPI, PostgreSQL, "
               "Docker, Kubernetes, Terraform. Nice to have: Kafka, GraphQL. 5+ years."),
    JobIn(company="Initech", title="ML Platform Engineer",
          text="ML platform role. Required: Python, Docker, MLflow, Kubernetes, AWS. "
               "Nice to have: Ray, Kafka. 4+ years."),
    JobIn(company="Hooli", title="Senior AI Engineer",
          text="Senior AI engineer. Required: Python, PyTorch, distributed training, CUDA, "
               "Kubernetes. Nice to have: Triton, Rust. 7+ years."),
]


def main():
    init_db()
    db = SessionLocal()
    ingest_resume(db, "alex_carter_resume.pdf", RESUME, Embedder())
    for job in JOBS:
        ingest_job(db, job, JdParser(), Embedder())
    db.close()
    print("seeded.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Generate `sample_resume.pdf` fixture from the RESUME text**

Run:
```bash
docker compose run --rm api python -c "
from pypdf import PdfWriter
# minimal: write RESUME to a text-based pdf via reportlab fallback
" || pip install reportlab
docker compose run --rm api python -c "
from reportlab.pdfgen import canvas
from seed import RESUME
c = canvas.Canvas('tests/fixtures/sample_resume.pdf')
y=800
for line in RESUME.splitlines():
    c.drawString(40,y,line); y-=16
c.save(); print('pdf written')
"
```
Expected: `pdf written` (add `reportlab` to dev deps in `pyproject.toml`).

- [ ] **Step 3: Run the seed against a live stack (needs real API keys)**

Run: `docker compose up -d && docker compose run --rm api python seed.py`
Expected: `seeded.`; `localhost:3000` shows 3 jobs.

- [ ] **Step 4: Commit**

```bash
git add api/seed.py api/tests/fixtures/sample_resume.pdf api/pyproject.toml
git commit -m "feat: anonymized demo seed + sample resume fixture"
```

---

### Task 23: README (all assignment-required sections — author's voice)

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md` with these exact sections** (the assignment grades each):

```markdown
# Career Intelligence Assistant

Analyze a resume against multiple job descriptions: explainable fit score, skill-gap
analysis, generated interview questions, and a grounded chat.

## Quick setup
1. `cp .env.example .env` and add `OPENAI_API_KEY` + `ANTHROPIC_API_KEY`.
2. `docker compose up --build`
3. Seed demo data: `docker compose run --rm api python seed.py`
4. Open http://localhost:3000 · API docs at http://localhost:8000/docs

## Architecture
[diagram] Next.js workspace → FastAPI → Postgres+pgvector. OpenAI embeddings,
Claude chat. Direct API calls, no orchestration framework.

## Productionizing (AWS/GCP)
[author writes: managed pgvector/RDS or Aurora, S3 for PDFs, ECS Fargate, secrets
manager, autoscaling, embedding cache, eval in CI, multi-tenant auth + RLS, rate limiting]

## RAG / LLM approach & decisions
[author writes, per criterion: chunking (section-aware resume + recursive JD),
embedding model (text-embedding-3-small, why), LLM (Claude Sonnet 4.6, why),
vector DB (pgvector over Pinecone, trade-off), orchestration (none, why no LangChain),
prompt & context management (file-based prompts, citation contract),
guardrails (topic/length/PII), quality (deterministic fit score, eval set),
observability (structlog + Langfuse + UI header)]

## Key technical decisions
[author: deterministic fit score vs LLM %, multi-provider, pgvector, no LangChain]

## Engineering standards followed (and skipped)
[author: followed — typed, containerized, tested vs real PG, eval set, structured logs.
skipped — auth, deploy, CI, e2e, rate limiting — with the production answer for each]

## How I used AI tools
[AUTHOR WRITES THIS SECTION PERSONALLY — Claude Code for scaffolding/boilerplate/tests;
hand-wrote prompts, chunking, scoring; do's/don'ts; how I keep it repeatable]

## What I'd do differently with more time
[author: salary normalization, resume-tailoring suggestions, hybrid rerank, CI eval gate]

## Screenshots
![workspace](docs/screenshot-workspace.png)
```

- [ ] **Step 2: Replace each `[author writes...]` block with your own prose.**

This is mandatory — the brief warns twice the README must be your thinking, not LLM output. Write it yourself; the bracketed notes are only scaffolding.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README with all required sections"
```

---

### Task 24: Full verification + screenshots + demo video

**Files:**
- Create: `docs/screenshot-workspace.png` (+ 2-4 more)

- [ ] **Step 1: Run the entire backend suite**

Run: `docker compose run --rm api pytest -q`
Expected: all green.

- [ ] **Step 2: Fresh-clone smoke test**

Run:
```bash
docker compose down -v
docker compose up --build -d
docker compose run --rm api python seed.py
curl -s localhost:8000/jobs | python -m json.tool
```
Expected: 3 jobs returned; `localhost:3000` fully interactive.

- [ ] **Step 3: Capture screenshots** of: workspace with a job selected (dashboard), chat mid-answer with citations, jobs ranked by fit. Save to `docs/`.

- [ ] **Step 4: Record a 60-90s Loom** walking the demo (upload → ranked jobs → fit dashboard → chat with citations).

- [ ] **Step 5: Final commit**

```bash
git add docs/
git commit -m "docs: screenshots + demo assets"
```

---

## Self-review (completed against the spec)

- **Spec §2 product shape** → Tasks 19-21 (rail, dashboard, chat). ✓
- **Spec §3 stack/architecture** → Tasks 1-3. ✓
- **Spec §4 data model** → Task 3 (all 5 tables). ✓
- **Spec §5 RAG engine**: chunking → Task 5; JD extraction → Task 8; fit scoring → Tasks 12-13; chat grounding → Task 11; guardrails → Task 15. ✓
- **Spec §6/§7 module layouts** → followed in every task's file paths. ✓
- **Spec §8 engineering standards**: tests throughout; eval set → Task 17; observability → Task 16; skipped-work documented → Task 23. ✓
- **Spec §9 build sequence** → phases map to the 4 days. ✓
- **Spec §10 success criteria** → Task 24 smoke test. ✓
- **Type consistency check**: `ingest_resume`, `ingest_job`, `JobIn`, `compute_fit`, `match_skills`, `retrieve`, `build_context`, `streamChat`, `FitOut` names used identically across producing and consuming tasks. ✓
- **Placeholder scan**: README intentionally contains author-written sections (required by the brief) — these are flagged as a mandatory human step, not silent placeholders. No other TBDs. ✓
```
