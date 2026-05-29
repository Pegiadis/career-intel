# Career Intelligence Assistant — Design Spec

**For**: NewPage take-home assignment (Option 4)
**Author**: Ioannis Pegiadis
**Date**: 2026-05-29
**Build budget**: 3–4 focused days

---

## 1. Goal

Build a fullstack RAG application that analyzes a resume against multiple job descriptions and answers questions about fit, skill gaps, experience alignment, and interview preparation.

The assignment is graded on: working RAG functionality, UI/UX creativity, the *thought process* behind RAG decisions (chunking, embedding, retrieval, prompting, guardrails, quality, observability), engineering excellence (clean/containerized/tested/observable), and how AI coding tools were used. The README must reflect the author's own reasoning, not LLM output.

**Guiding principle from the brief**: *"a solid & well-engineered basic solution A LOT MORE than an over-engineered complex one."* We optimize for defensible engineering judgment over feature count.

---

## 2. Product shape (Direction B — structured analysis + chat)

Two surfaces over one engine:

1. **Fit Dashboard** (per job): a fit score with an *explainable, deterministic* breakdown, matched/missing skills, an LLM-written summary, and auto-generated interview questions.
2. **Grounded chat**: open follow-up questions answered from retrieved resume + JD chunks, with citations back to source sections.

### Layout (approved): IDE-style workspace
- **Left rail**: uploaded resume (with parsed-section + chunk count), jobs list ranked by fit score, "+ add job".
- **Center**: fit dashboard for the selected job — score ring, breakdown bars (required coverage, nice-to-have, seniority), matched skills (green chips), missing skills (red chips), fit summary, generated interview questions tagged to gaps/matches.
- **Right**: docked chat grounded in resume + selected JD; every answer carries citation tags.
- **Header**: live `model · tokens · latency` for visible observability.

### Demo data
Anonymized but realistic: a fictional senior backend/AI engineer resume + 3 realistic JDs (e.g. "Globex / Backend Engineer", "Initech / ML Platform Engineer", "Hooli / Senior AI Engineer") at high/medium/low fit so the ranking is visible. Seeded on startup so the reviewer can use the app immediately.

---

## 3. Architecture

```
┌─────────────────┐      ┌──────────────────┐      ┌──────────────┐
│   Next.js Web   │ ───▶ │  FastAPI Backend │ ───▶ │  Postgres +  │
│ Tailwind/shadcn │ ◀─── │  (Python 3.12)   │ ◀─── │   pgvector   │
└─────────────────┘ SSE  └────────┬─────────┘      └──────────────┘
                                  ├──▶ OpenAI  text-embedding-3-small
                                  ├──▶ Anthropic Claude Sonnet 4.6
                                  └──▶ Langfuse  (token + latency tracing)
```

`docker compose up` brings up postgres+pgvector, api, web. Reviewer never touches host Python/Node.

### Stack & the one-line defense for each (README material)
| Layer | Choice | Defense |
|-------|--------|---------|
| Backend | FastAPI (Python 3.12) | Async, typed, fastest to ship |
| Frontend | Next.js + Tailwind + shadcn/ui | Polished UI quickly |
| DB + vectors | Postgres + pgvector | One store for relational + vectors; no Pinecone lock-in for a take-home (honest trade-off documented) |
| Embeddings | OpenAI text-embedding-3-small | Cheap, fast, 1536-dim |
| Chat LLM | Anthropic Claude Sonnet 4.6 | Best reasoning for fit analysis |
| Orchestration | None (direct API calls) | Full control of prompts/retries/observability; avoid LangChain abstraction debt |
| Container | Docker Compose | One-command setup |
| Observability | structlog + Langfuse | Per-query token/latency/trace |
| Tests | pytest vs real Postgres | No mocked DB |

### Deliberate trade-offs to defend in interview
pgvector over Pinecone · no LangChain · multi-provider (OpenAI embeddings + Anthropic chat) · **deterministic fit score, not an LLM-invented percentage**.

---

## 4. Data model

```
resumes        (id, filename, raw_text, parsed_sections JSONB, created_at)
jobs           (id, title, company, raw_text, parsed_jd JSONB, source_url, created_at)
chunks         (id, source_type, source_id, section, content,
                embedding VECTOR(1536), token_count, created_at)
queries        (id, question, resume_id, job_id, response,
                retrieved_chunk_ids INT[], latency_ms, tokens_used, created_at)
fit_analyses   (id, resume_id, job_id, fit_score INT, matched_skills JSONB,
                missing_skills JSONB, sub_scores JSONB, summary TEXT, created_at)
```

- `parsed_sections` → `{contact, summary, experience:[{company,role,dates,bullets}], skills[], education[]}`
- `parsed_jd` → `{required_skills[], nice_to_have[], responsibilities[], seniority, salary, location}`
- Parsing happens once at ingestion; queries read JSONB like normal columns (no re-parsing per request).

---

## 5. RAG engine (the graded core)

### Ingestion
- **Resume**: pypdf → section detection via heading regex → one chunk per section, tagged `section`. Resumes are short; section-level chunks keep whole bullets intact and enable section-filtered retrieval.
- **JD**: one Claude call → structured JSON (`required_skills`, `nice_to_have`, `seniority`, …) stored as JSONB. Raw JD *also* recursively chunked (~500 tokens) for chat grounding.
- Both chunk sets → OpenAI embeddings (batched, retried, cost-logged) → pgvector.

### Fit scoring (deterministic)
```
required_coverage  = matched_required / total_required     (weight 0.5)
nice_to_have_cover = matched_nice / total_nice             (weight 0.2)
seniority_match    = 1.0 if resume_years >= jd_years else resume_years/jd_years  (weight 0.3)
fit_score = round(100 * (0.5*required_coverage + 0.2*nice_to_have_cover + 0.3*seniority_match))
```
Skill matching: embed each JD skill, cosine-match against resume skill chunks above a threshold, with keyword fallback for exact tokens. The LLM writes only the prose summary on top of these numbers. Score is computed, explainable, reproducible.

### Chat (grounded)
Retrieve top-k chunks (hybrid: pgvector cosine + keyword) filtered to active resume + selected JD → Claude prompt that must cite the source section per claim → SSE token stream to the UI.

### Guardrails
Off-topic query rejection · input length cap · PII masking in logs · "not in your resume" fallback when retrieval is empty (anti-hallucination).

---

## 6. Backend module layout

```
api/
  app.py                  # FastAPI app + lifespan + CORS
  config.py               # pydantic-settings; secrets from env
  db.py                   # SQLAlchemy 2 + pgvector session
  models/                 # resume, job, chunk, query, fit
  routers/                # resumes, jobs, chat (SSE), fit
  services/
    pdf_parser.py         # pypdf + section detection
    jd_parser.py          # Claude → structured JSON
    chunker.py            # section-aware (resume) + recursive (JD)
    embedder.py           # OpenAI batch + retry + cost tracking
    retriever.py          # pgvector cosine + keyword hybrid
    chat.py               # conversation orchestration + citations
    fit_analyzer.py       # 3-component composite score
    guardrails.py         # topic check, length cap, PII redaction
  prompts/                # versioned .txt: system_chat, fit_analysis, skill_extraction, interview_questions
  observability/          # logger.py (structlog), tracing.py (Langfuse)
  tests/
    test_pdf_parser.py / test_chunker.py / test_fit_analyzer.py
    test_retriever.py / test_chat_e2e.py
    fixtures/ sample_resume.pdf, sample_jd_*.txt, eval_set.json
```

## 7. Frontend module layout

```
web/
  app/
    page.tsx                       # workspace shell (rail + center + chat)
  components/
    ResumeUpload.tsx
    JobInput.tsx                   # paste or URL
    JobList.tsx                    # ranked by fit
    FitDashboard.tsx               # ring + breakdown bars + chips + summary
    InterviewPrep.tsx              # generated questions
    ChatPanel.tsx                  # SSE stream + citation tags
    ObservabilityHeader.tsx        # model · tokens · latency
  lib/ api.ts (typed client), sse.ts (stream reader)
```

---

## 8. Engineering standards

**Followed**: containerized (one-command), typed (pydantic + SQLAlchemy 2 + TS strict), tested against real Postgres (unit: parser/chunker/scoring; integration: ingest→embed→retrieve; eval set asserting retrieval recall), structlog with request_id, Langfuse traces surfaced in UI, env-based config with `.env.example`, prompts as versioned files.

**Deliberately skipped (documented with why + production answer)**:
| Skipped | Why | Production answer |
|---------|-----|-------------------|
| Multi-user auth | Single-user local app | Clerk + Postgres RLS |
| Cloud deploy | Out of scope | Terraform → ECS Fargate + RDS pgvector + S3 |
| CI/CD | Time | GH Actions: pytest + eval set per PR |
| E2E browser tests | Time | Playwright smoke flow |
| Rate limiting | Single user | Redis token bucket |

**AI-assisted development story** (graded): Claude Code for scaffolding, boilerplate, and test generation; hand-written prompts, chunking logic, and scoring formula (where domain judgment must be defended). README do's/don'ts written by the author, not generated.

---

## 9. Build sequence (3.5 days)

- **Day 1 — backend + resume ingestion**: docker compose, models, migrations, pdf_parser, chunker, embedder, store resume end-to-end. Verify: `curl -F file=@resume.pdf /resumes` → chunks in DB.
- **Day 2 — JD ingestion + retrieval + chat**: jd_parser, vector search w/ metadata filter, SSE chat with file-based prompts + citations. Verify: streamed grounded answer.
- **Day 3 — fit analysis + frontend**: fit_analyzer (3-component), skill match, missing-skill detection; Next.js workspace (rail + dashboard + chat). Verify: full UI flow on seeded data.
- **Day 4 — polish + README + demo**: eval set in pytest, guardrails, Langfuse/log polish; README (all required sections), 5 screenshots, 90s Loom, fresh-clone smoke test.

If Day 4 is cut: README quality beats another feature (brief says so).

---

## 10. Success criteria

- `docker compose up` works from a fresh clone.
- Reviewer can: see ranked jobs, open a fit dashboard, read an explainable score, chat with cited answers.
- README articulates RAG decisions, trade-offs, skipped work, and AI-tooling approach in the author's own voice.
- pytest (incl. eval set) green.

---

## 11. Out of scope (explicitly)

Voice input, multi-user accounts, live deployment, resume rewriting/auto-tailoring, company web-research agent. Listed in README under "what I'd do next."
