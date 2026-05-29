import { BASE } from "./api";

export async function streamChat(
  body: { resume_id: number; job_id: number | null; question: string },
  onToken: (t: string) => void,
) {
  const res = await fetch(`${BASE}/chat`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    for (const line of dec.decode(value).split("\n\n")) {
      if (line.startsWith("data: ")) {
        const t = line.slice(6);
        if (t === "[DONE]") return;
        onToken(t);
      }
    }
  }
}
