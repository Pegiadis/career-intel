import type { ResumeOut, JobOut, FitOut } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function ok(res: Response): Promise<Response> {
  if (!res.ok) throw new Error((await res.text().catch(() => "")) || `Request failed (${res.status})`);
  return res;
}

export async function uploadResume(file: File): Promise<ResumeOut> {
  const fd = new FormData(); fd.append("file", file);
  return (await ok(await fetch(`${BASE}/resumes`, { method: "POST", body: fd }))).json();
}
export async function getLatestResume(): Promise<ResumeOut | null> {
  const res = await fetch(`${BASE}/resumes/latest`);
  if (res.status === 404) return null;
  return (await ok(res)).json();
}
export async function addJob(body: { title: string; company: string; text: string }): Promise<JobOut> {
  return (await ok(await fetch(`${BASE}/jobs`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }))).json();
}
export async function listJobs(resumeId?: number): Promise<JobOut[]> {
  const q = resumeId ? `?resume_id=${resumeId}` : "";
  return (await ok(await fetch(`${BASE}/jobs${q}`))).json();
}
export async function analyzeFit(resumeId: number, jobId: number): Promise<FitOut> {
  return (await ok(await fetch(`${BASE}/fit/${resumeId}/${jobId}`, { method: "POST" }))).json();
}
export { BASE };
