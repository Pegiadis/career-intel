import time
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from db import SessionLocal
from models import Query
from schemas import ChatRequest
from services.guardrails import check_query
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
    ok, msg = check_query(req.question)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
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
