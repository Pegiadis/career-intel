"use client";
import { useEffect, useState } from "react";
import { ResumeUpload } from "@/components/ResumeUpload";
import { JobInput } from "@/components/JobInput";
import { JobList } from "@/components/JobList";
import { listJobs, analyzeFit } from "@/lib/api";
import type { JobOut, ResumeOut, FitOut } from "@/lib/types";

export default function Page() {
  const [resume, setResume] = useState<ResumeOut | null>(null);
  const [jobs, setJobs] = useState<JobOut[]>([]);
  const [activeJob, setActiveJob] = useState<number | null>(null);
  const [fit, setFit] = useState<FitOut | null>(null);

  const refresh = async () => setJobs(await listJobs());
  useEffect(() => { refresh(); }, []);

  const selectJob = async (id: number) => {
    setActiveJob(id);
    if (resume) {
      const f = await analyzeFit(resume.id, id); setFit(f);
      setJobs((js) => js.map((j) => j.id === id ? { ...j, fit_score: f.fit_score } : j));
    }
  };

  return (
    <div className="border border-slate-200 m-4 rounded-xl overflow-hidden shadow-lg">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white">
        <div className="font-bold">Career<span className="text-blue-400">Intel</span></div>
      </div>
      <div className="flex min-h-[460px]">
        <aside className="w-60 border-r border-slate-100 p-3 bg-slate-50">
          <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1.5">Resume</div>
          <ResumeUpload onUploaded={setResume} />
          <div className="text-[10px] uppercase tracking-wide text-slate-400 my-1.5">Jobs · ranked by fit</div>
          <JobList jobs={jobs} activeId={activeJob} onSelect={selectJob} />
          <JobInput onAdded={refresh} />
        </aside>
        <main className="flex-1 p-4" id="center-slot">
          {fit ? <pre className="text-xs">{JSON.stringify(fit, null, 2)}</pre>
               : <p className="text-slate-400 text-sm">Select a job to see fit analysis.</p>}
        </main>
        <section className="w-80 bg-slate-50" id="chat-slot">
        </section>
      </div>
    </div>);
}
