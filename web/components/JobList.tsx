"use client";
import type { JobOut } from "@/lib/types";

export function JobList({ jobs, activeId, onSelect }:
  { jobs: JobOut[]; activeId: number | null; onSelect: (id: number) => void }) {
  const color = (s?: number) => s == null ? "text-slate-400"
    : s >= 70 ? "text-green-700" : s >= 55 ? "text-yellow-600" : "text-red-600";
  return (
    <div className="space-y-1.5">
      {jobs.map((j) => (
        <div key={j.id} onClick={() => onSelect(j.id)}
          className={`flex justify-between items-center p-2 border rounded-lg bg-white cursor-pointer text-xs
            ${activeId === j.id ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200"}`}>
          <div><div className="font-semibold">{j.company}</div>
            <div className="text-slate-400">{j.title}</div></div>
          <div className={`font-extrabold ${color(j.fit_score)}`}>{j.fit_score ?? "—"}</div>
        </div>))}
    </div>);
}
