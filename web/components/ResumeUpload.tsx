"use client";
import { useState } from "react";
import { uploadResume } from "@/lib/api";
import type { ResumeOut } from "@/lib/types";

export function ResumeUpload({ onUploaded }: { onUploaded: (r: ResumeOut) => void }) {
  const [resume, setResume] = useState<ResumeOut | null>(null);
  return (
    <div className="border border-slate-200 rounded-lg p-2 bg-white text-xs">
      {resume ? (
        <div><b>{resume.filename}</b><div className="text-slate-400">
          {resume.section_count} sections · {resume.chunk_count} chunks · embedded ✓</div></div>
      ) : (
        <input type="file" accept="application/pdf" onChange={async (e) => {
          const f = e.target.files?.[0]; if (!f) return;
          const r = await uploadResume(f); setResume(r); onUploaded(r);
        }} />
      )}
    </div>
  );
}
