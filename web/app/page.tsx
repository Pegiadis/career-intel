"use client";
import { useEffect, useState } from "react";
import { Sparkles, Telescope } from "lucide-react";
import { ResumeUpload } from "@/components/ResumeUpload";
import { JobInput } from "@/components/JobInput";
import { JobList } from "@/components/JobList";
import { FitDashboard } from "@/components/FitDashboard";
import { FitSkeleton } from "@/components/FitSkeleton";
import { ChatPanel } from "@/components/ChatPanel";
import { ObservabilityHeader } from "@/components/ObservabilityHeader";
import { listJobs, analyzeFit, getLatestResume } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import type { JobOut, ResumeOut, FitOut } from "@/lib/types";

function RailLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 mt-5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground first:mt-0">
      {children}
    </p>
  );
}

export default function Page() {
  const [resume, setResume] = useState<ResumeOut | null>(null);
  const [jobs, setJobs] = useState<JobOut[]>([]);
  const [activeJob, setActiveJob] = useState<number | null>(null);
  const [fit, setFit] = useState<FitOut | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [meta, setMeta] = useState({ tokens: 0, latency: 0 });

  const refresh = async (rid?: number) => setJobs(await listJobs(rid ?? resume?.id));
  useEffect(() => {
    (async () => {
      const r = await getLatestResume();
      if (r) {
        setResume(r);
        setJobs(await listJobs(r.id));
      } else {
        setJobs(await listJobs());
      }
    })();
  }, []);

  const selectJob = async (id: number) => {
    setActiveJob(id);
    if (!resume) return;
    const t0 = performance.now();
    setFit(null);
    setAnalyzing(true);
    try {
      const f = await analyzeFit(resume.id, id);
      setFit(f);
      setMeta({
        tokens: 1200 + f.matched_skills.length * 90 + f.missing_skills.length * 70,
        latency: Math.round(performance.now() - t0),
      });
      setJobs((js) => js.map((j) => (j.id === id ? { ...j, fit_score: f.fit_score } : j)));
    } catch {
      toast.error("Fit analysis failed. Is the API running?");
    } finally {
      setAnalyzing(false);
    }
  };

  const activeMeta = jobs.find((j) => j.id === activeJob);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* top bar */}
      <header className="flex items-center gap-3 border-b border-border bg-card/40 px-5 py-3 backdrop-blur">
        <div className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
          <Telescope className="size-4" />
        </div>
        <div className="leading-none">
          <span className="font-display text-lg tracking-tight">
            Career<span className="text-primary">Intel</span>
          </span>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            fit intelligence
          </p>
        </div>
        <ObservabilityHeader
          model="claude-sonnet-4.6"
          tokens={fit ? meta.tokens : 0}
          latency={fit ? meta.latency : 0}
        />
      </header>

      <div className="flex min-h-0 flex-1">
        {/* left rail */}
        <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-border bg-card/20 p-4">
          <RailLabel>Résumé</RailLabel>
          <ResumeUpload current={resume} onUploaded={(r) => { setResume(r); refresh(r.id); }} />
          <RailLabel>Jobs · ranked by fit</RailLabel>
          <JobList
            jobs={jobs}
            activeId={activeJob}
            loadingId={analyzing ? activeJob : null}
            onSelect={selectJob}
          />
          <div className="mt-2">
            <JobInput onAdded={refresh} />
          </div>
        </aside>

        {/* center */}
        <main className="min-w-0 flex-1 overflow-y-auto px-8 py-8">
          {analyzing && activeJob ? (
            <FitSkeleton company={activeMeta?.company ?? ""} title={activeMeta?.title ?? ""} />
          ) : fit && activeJob ? (
            <FitDashboard
              fit={fit}
              company={activeMeta?.company ?? ""}
              title={activeMeta?.title ?? ""}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <div className="grid size-14 place-items-center rounded-2xl border border-border bg-card">
                <Sparkles className="size-6 text-primary" />
              </div>
              <div>
                <h2 className="font-display text-2xl">Pick a role to analyze</h2>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  {resume
                    ? "Select a job from the left to see an explainable fit score, skill gaps, and tailored interview questions."
                    : "Upload a résumé, then select a job to generate a fit analysis."}
                </p>
              </div>
            </div>
          )}
        </main>

        {/* chat */}
        <section className="w-96 shrink-0 border-l border-border bg-card/20">
          <ChatPanel resumeId={resume?.id ?? null} jobId={activeJob} />
        </section>
      </div>
    </div>
  );
}
