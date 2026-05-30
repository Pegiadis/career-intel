import math


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(y * y for y in b)) or 1.0
    return dot / (na * nb)


def match_skills(jd_skills: list[str], resume_text: str,
                 resume_skill_vecs: dict[str, list[float]],
                 jd_skill_vecs: dict[str, list[float]],
                 threshold: float = 0.8) -> tuple[list[str], list[str]]:
    matched, missing = [], []
    low_resume = resume_text.lower()
    for skill in jd_skills:
        if skill.lower() in low_resume:
            matched.append(skill)
            continue
        jv = jd_skill_vecs.get(skill)
        hit = jv is not None and any(
            _cosine(jv, rv) >= threshold for rv in resume_skill_vecs.values()
        )
        (matched if hit else missing).append(skill)
    return matched, missing
