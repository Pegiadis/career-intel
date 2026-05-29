from services.fit_analyzer import compute_fit

def test_perfect_fit_scores_100():
    result = compute_fit(
        matched_required=["a","b"], total_required=["a","b"],
        matched_nice=["c"], total_nice=["c"],
        resume_years=6, jd_min_years=5,
    )
    assert result["fit_score"] == 100
    assert result["sub_scores"]["required_coverage"] == 1.0

def test_partial_fit_weights_apply():
    # required 1/2 (=.5 *0.5=.25), nice 0/2 (0), seniority ok (1*0.3=.3) => .55 => 55
    result = compute_fit(
        matched_required=["a"], total_required=["a","b"],
        matched_nice=[], total_nice=["c","d"],
        resume_years=6, jd_min_years=5,
    )
    assert result["fit_score"] == 55

def test_seniority_partial_when_underexperienced():
    # required 2/2 (.5), nice 0 (0), seniority 3/6=.5 *0.3=.15 => .65 => 65
    result = compute_fit(
        matched_required=["a","b"], total_required=["a","b"],
        matched_nice=[], total_nice=["c"],
        resume_years=3, jd_min_years=6,
    )
    assert result["fit_score"] == 65

def test_no_requirements_does_not_divide_by_zero():
    result = compute_fit([], [], [], [], resume_years=5, jd_min_years=None)
    assert 0 <= result["fit_score"] <= 100
