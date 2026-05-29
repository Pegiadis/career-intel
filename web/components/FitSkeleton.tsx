"use client";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

const STEPS = [
  "Embedding job requirements…",
  "Matching against your résumé…",
  "Scoring fit · skills + seniority…",
  "Writing the fit summary…",
  "Generating interview questions…",
];

function Block({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-secondary ${className ?? ""}`} />;
}

export function FitSkeleton({ company, title }: { company: string; title: string }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1400);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="mx-auto max-w-3xl animate-fade-in space-y-8">
      {/* hero */}
      <div className="flex items-center gap-7">
        <div className="relative grid size-32 shrink-0 place-items-center">
          <div
            className="absolute inset-0 animate-spin rounded-full"
            style={{
              background: "conic-gradient(hsl(var(--primary)) 25%, hsl(214 32% 91%) 0)",
              mask: "radial-gradient(farthest-side, transparent 70%, #000 71%)",
              WebkitMask: "radial-gradient(farthest-side, transparent 70%, #000 71%)",
            }}
          />
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
            scoring
          </span>
        </div>
        <div className="flex-1 space-y-3">
          <Block className="h-2.5 w-24" />
          <p className="font-display text-3xl leading-tight text-foreground/90">
            {company || "Analyzing…"}
          </p>
          <div className="space-y-2.5 pt-1">
            <Block className="h-1.5 w-full" />
            <Block className="h-1.5 w-[85%]" />
            <Block className="h-1.5 w-[70%]" />
          </div>
        </div>
      </div>

      {/* skill cards */}
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-border bg-card/40 p-4">
          <Block className="h-4 w-24" />
          <div className="flex flex-wrap gap-1.5">
            {["w-16", "w-12", "w-20", "w-14"].map((w, i) => <Block key={i} className={`h-5 ${w}`} />)}
          </div>
        </div>
        <div className="space-y-3 rounded-xl border border-border bg-card/40 p-4">
          <Block className="h-4 w-28" />
          <div className="flex flex-wrap gap-1.5">
            {["w-14", "w-20"].map((w, i) => <Block key={i} className={`h-5 ${w}`} />)}
          </div>
        </div>
      </div>

      {/* summary */}
      <div className="space-y-3">
        <Block className="h-5 w-32" />
        <div className="space-y-2 rounded-xl border border-border bg-card/40 p-5">
          <Block className="h-3 w-full" />
          <Block className="h-3 w-full" />
          <Block className="h-3 w-[60%]" />
        </div>
      </div>

      {/* live status */}
      <div className="flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/[0.04] px-4 py-3">
        <Loader2 className="size-4 animate-spin text-primary" />
        <span className="font-mono text-xs text-foreground/80">{STEPS[step]}</span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground tnum">
          {step + 1}/{STEPS.length}
        </span>
      </div>
    </div>
  );
}
