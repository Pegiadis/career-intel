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
