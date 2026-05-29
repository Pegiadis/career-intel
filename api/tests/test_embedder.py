from services.embedder import Embedder

class FakeClient:
    def __init__(self): self.calls = 0
    class embeddings:  # noqa
        pass

class FakeEmbeddings:
    def __init__(self, dim): self.dim = dim; self.calls = 0
    def create(self, model, input):
        self.calls += 1
        data = [type("E", (), {"embedding": [0.1] * self.dim})() for _ in input]
        usage = type("U", (), {"total_tokens": 7 * len(input)})()
        return type("R", (), {"data": data, "usage": usage})()

class FakeOpenAI:
    def __init__(self, dim=1536): self.embeddings = FakeEmbeddings(dim)

def test_embeds_batch_and_tracks_tokens():
    emb = Embedder(client=FakeOpenAI(dim=4), model="m", dim=4)
    vectors, tokens = emb.embed(["a", "b", "c"])
    assert len(vectors) == 3
    assert len(vectors[0]) == 4
    assert tokens == 21
    assert emb.client.embeddings.calls == 1   # one batched call
