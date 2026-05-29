from services.guardrails import check_query, redact_pii

def test_rejects_too_long():
    ok, msg = check_query("x" * 3000)
    assert not ok and "too long" in msg.lower()

def test_accepts_normal_query():
    ok, _ = check_query("What skills am I missing?")
    assert ok

def test_redacts_email_and_phone():
    out = redact_pii("reach me at a@b.com or +30 691 1234567")
    assert "a@b.com" not in out
    assert "6911234567" not in out.replace(" ", "")
