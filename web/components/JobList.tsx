"use client";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { JobOut } from "@/lib/types";

function scoreColor(s?: number) {
  if (s == null) return "text-muted-foreground";
  if (s >= 70) return "text-good";
  if (s >= 55) return "text-mid";
  return "text-low";
}

export function JobList({ jobs, activeId, loadingId, onSelect }:
  { jobs: JobOut[]; activeId: number | null; loadingId?: number | null; onSelect: (id: number) => void }) {
  if (jobs.length === 0) {
    return <p className="px-1 py-3 text-xs text-muted-foreground">No jobs yet — add one below.</p>;
  }
  return (
    <div className="space-y-1.5">
      {jobs.map((j, i) => {
        const active = activeId === j.id;
        return (
          <button
            key={j.id}
            onClick={() => onSelect(j.id)}
            style={{ animationDelay: `${i * 60}ms` }}
            className={cn(
              "group flex w-full animate-fade-up items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-all",
              active
                ? "border-primary/50 bg-primary/[0.07] shadow-[0_0_0_1px_hsl(var(--primary)/0.25)]"
                : "border-border bg-card/40 hover:border-border/80 hover:bg-card/80",
            )}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{j.company}</p>
              <p className="truncate text-xs text-muted-foreground">{j.title}</p>
            </div>
            <span className={cn("ml-2 font-mono text-base font-bold tnum", scoreColor(j.fit_score))}>
              {loadingId === j.id ? (
                <Loader2 className="size-4 animate-spin text-primary" />
              ) : (
                j.fit_score ?? "—"
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
