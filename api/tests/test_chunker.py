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
