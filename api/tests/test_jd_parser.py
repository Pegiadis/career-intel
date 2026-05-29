from services.jd_parser import JdParser

class FakeMsg:
    def __init__(self, txt): self.content = [type("B", (), {"text": txt})()]
    usage = type("U", (), {"input_tokens": 10, "output_tokens": 5})()

class FakeMessages:
    def create(self, **kw):
        return FakeMsg('{"required_skills":["Python","Docker"],"nice_to_have":["Go"],'
                       '"responsibilities":["Build APIs"],"seniority":"senior",'
                       '"min_years":5,"salary":null,"location":"Remote"}')

class FakeAnthropic:
    def __init__(self): self.messages = FakeMessages()

def test_parses_jd_to_struct():
    parser = JdParser(client=FakeAnthropic(), model="m")
    parsed = parser.parse("Senior Python engineer...")
    assert parsed["required_skills"] == ["Python", "Docker"]
    assert parsed["seniority"] == "senior"
    assert parsed["min_years"] == 5
