const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function uploadResume(file: File) {
  const fd = new FormData(); fd.append("file", file);
  return (await fetch(`${BASE}/resumes`, { method: "POST", body: fd })).json();
}
export async function addJob(body: { title: string; company: string; text: string }) {
  return (await fetch(`${BASE}/jobs`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  })).json();
}
export async function listJobs() { return (await fetch(`${BASE}/jobs`)).json(); }
export async function analyzeFit(resumeId: number, jobId: number) {
  return (await fetch(`${BASE}/fit/${resumeId}/${jobId}`, { method: "POST" })).json();
}
export { BASE };
