def chunk_resume_sections(sections: dict[str, str]) -> list[dict]:
    return [
        {"section": name, "content": body}
        for name, body in sections.items()
        if name != "header" and body.strip()
    ]


def chunk_text(text: str, max_chars: int = 1800, overlap: int = 180) -> list[str]:
    if len(text) <= max_chars:
        return [text]
    chunks, start = [], 0
    while start < len(text):
        end = start + max_chars
        chunks.append(text[start:end])
        if end >= len(text):
            break
        start = end - overlap
    return chunks
