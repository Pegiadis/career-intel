from services.skill_matcher import match_skills

def test_exact_keyword_match():
    matched, missing = match_skills(
        jd_skills=["Python", "Kubernetes"],
        resume_text="Experienced in Python and FastAPI.",
        resume_skill_vecs={}, jd_skill_vecs={}, threshold=0.8,
    )
    assert "Python" in matched
    assert "Kubernetes" in missing

def test_semantic_match_via_vectors():
    # identical vectors -> cosine 1.0 -> matched even without keyword
    v = [1.0, 0.0]
    matched, missing = match_skills(
        jd_skills=["Container orchestration"],
        resume_text="no literal overlap here",
        resume_skill_vecs={"kubernetes": v},
        jd_skill_vecs={"Container orchestration": v},
        threshold=0.8,
    )
    assert "Container orchestration" in matched
