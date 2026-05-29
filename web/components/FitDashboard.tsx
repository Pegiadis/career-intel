import { CheckCircle2, AlertTriangle, BadgeCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { InterviewPrep } from "./InterviewPrep";
import type { FitOut } from "@/lib/types";

function ringColor(s: number) {
  if (s >= 70) return "hsl(152 56% 52%)";
  if (s >= 55) return "hsl(40 95% 58%)";
  return "hsl(352 84% 64%)";
}
function textColor(s: number) {
  if (s >= 70) return "text-good";
  if (s >= 55) return "text-mid";
  return "text-low";
}

function ScoreRing({ score }: { score: number }) {
  const color = ringColor(score);
  return (
    <div className="relative grid size-32 shrink-0 place-items-center">
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(${color} ${score}%, hsl(34 12% 16%) 0)`,
          mask: "radial-gradient(farthest-side, transparent 70%, #000 71%)",
          WebkitMask: "radial-gradient(farthest-side, transparent 70%, #000 71%)",
        }}
      />
      <div className="flex flex-col items-center">
        <span className={`font-mono text-4xl font-bold leading-none tnum ${textColor(score)}`}>
          {score}
        </span>
        <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
          fit
        </span>
      </div>
    </div>
  );
}

function Bar({ label, pct, right }: { label: string; pct: number; right: string }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full origin-left animate-bar-grow rounded-full bg-primary"
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
      <span className="w-16 shrink-0 text-right font-mono text-foreground/80 tnum">{right}</span>
    </div>
  );
}

export function FitDashboard({ fit, company, title }:
  { fit: FitOut; company: string; title: string }) {
  const s = fit.sub_scores;
  const totalReq = fit.matched_skills.length + fit.missing_skills.length;
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* hero */}
      <div className="flex animate-fade-up items-center gap-7">
        <ScoreRing score={fit.fit_score} />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">{title}</p>
            <h2 className="font-display text-3xl leading-tight">{company}</h2>
          </div>
          <div className="space-y-2">
            <Bar label="Required skills" pct={s.required_coverage * 100}
                 right={`${fit.matched_skills.length}/${totalReq}`} />
            <Bar label="Nice-to-have" pct={s.nice_to_have_coverage * 100}
                 right={`${Math.round(s.nice_to_have_coverage * 100)}%`} />
            <Bar label="Seniority" pct={s.seniority_match * 100}
                 right={s.seniority_match >= 1 ? "match" : "partial"} />
          </div>
        </div>
      </div>

      {/* skills */}
      <div className="grid animate-fade-up gap-5 sm:grid-cols-2" style={{ animationDelay: "80ms" }}>
        <div className="rounded-xl border border-good/20 bg-good/[0.04] p-4">
          <div className="mb-3 flex items-center gap-2 text-good">
            <CheckCircle2 className="size-4" />
            <span className="text-sm font-medium">Matched</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {fit.matched_skills.length === 0
              ? <span className="text-xs text-muted-foreground">None matched</span>
              : fit.matched_skills.map((sk) => <Badge key={sk} variant="good">{sk}</Badge>)}
          </div>
        </div>
        <div className="rounded-xl border border-low/20 bg-low/[0.04] p-4">
          <div className="mb-3 flex items-center gap-2 text-low">
            <AlertTriangle className="size-4" />
            <span className="text-sm font-medium">Missing / weak</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {fit.missing_skills.length === 0
              ? <span className="text-xs text-muted-foreground">No gaps 🎉</span>
              : fit.missing_skills.map((sk) => <Badge key={sk} variant="low">{sk}</Badge>)}
          </div>
        </div>
      </div>

      {/* summary */}
      <div className="animate-fade-up space-y-3" style={{ animationDelay: "160ms" }}>
        <div className="flex items-center gap-2">
          <BadgeCheck className="size-4 text-primary" />
          <h3 className="font-display text-lg">Fit summary</h3>
        </div>
        <div className="rounded-xl border border-border bg-gradient-to-br from-card to-background/40 p-5 text-sm leading-relaxed text-foreground/85">
          {fit.summary}
        </div>
      </div>

      {/* interview prep */}
      <div className="animate-fade-up" style={{ animationDelay: "240ms" }}>
        <InterviewPrep questions={fit.interview_questions} />
      </div>
    </div>
  );
}
