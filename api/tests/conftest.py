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
