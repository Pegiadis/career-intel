W_REQUIRED, W_NICE, W_SENIORITY = 0.5, 0.2, 0.3


def _coverage(matched: list, total: list) -> float:
    return 1.0 if not total else len(matched) / len(total)


def _seniority(resume_years: int, jd_min_years: int | None) -> float:
    if not jd_min_years:
        return 1.0
    return 1.0 if resume_years >= jd_min_years else resume_years / jd_min_years


def compute_fit(matched_required, total_required, matched_nice, total_nice,
                resume_years, jd_min_years) -> dict:
    req = _coverage(matched_required, total_required)
    nice = _coverage(matched_nice, total_nice)
    sen = _seniority(resume_years, jd_min_years)
    score = round(100 * (W_REQUIRED * req + W_NICE * nice + W_SENIORITY * sen))
    return {
        "fit_score": score,
        "sub_scores": {"required_coverage": req, "nice_to_have_coverage": nice,
                       "seniority_match": sen},
    }
