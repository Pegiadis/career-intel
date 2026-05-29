from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from db import init_db
from config import settings
from routers import resumes, jobs, chat, fit


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Career Intelligence Assistant", lifespan=lifespan)
app.add_middleware(CORSMiddleware,
                   allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
                   allow_methods=["*"], allow_headers=["*"])
app.include_router(resumes.router)
app.include_router(jobs.router)
app.include_router(chat.router)
app.include_router(fit.router)


@app.get("/health")
def health():
    return {"status": "ok"}
