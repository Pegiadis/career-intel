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
