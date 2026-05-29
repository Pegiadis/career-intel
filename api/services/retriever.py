from sqlalchemy import or_
from sqlalchemy.orm import Session
from models import Chunk


def retrieve(db: Session, query_vec: list[float], resume_id: int,
             job_id: int | None, keyword: str = "", k: int = 6) -> list[Chunk]:
    cond = (Chunk.source_type == "resume") & (Chunk.source_id == resume_id)
    if job_id:
        cond = or_(cond, (Chunk.source_type == "job") & (Chunk.source_id == job_id))
    source_filter = cond

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
