import re

MAX_LEN = 2000
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_PHONE = re.compile(r"\+?\d[\d\s]{7,}\d")


def check_query(q: str) -> tuple[bool, str]:
    if len(q) > MAX_LEN:
        return False, "Query too long; please shorten it."
    if not q.strip():
        return False, "Empty query."
    return True, ""


def redact_pii(text: str) -> str:
    text = _EMAIL.sub("[email]", text)
    text = _PHONE.sub("[phone]", text)
    return text
