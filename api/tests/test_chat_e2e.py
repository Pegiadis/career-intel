from services.chat import build_context

def test_build_context_tags_sections():
    class C:
        def __init__(self, st, sec, content): self.source_type=st; self.section=sec; self.content=content
    chunks = [C("resume","skills","Python"), C("job","jd","Needs Python")]
    ctx = build_context(chunks)
    assert "[resume §skills]" in ctx
    assert "[JD §jd]" in ctx
    assert "Python" in ctx
