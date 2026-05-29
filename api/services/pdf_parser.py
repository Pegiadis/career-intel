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
