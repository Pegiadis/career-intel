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
