import { Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { FitOut } from "@/lib/types";

export function InterviewPrep({ questions }: { questions: FitOut["interview_questions"] }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Target className="size-4 text-primary" />
        <h3 className="font-display text-lg">Interview prep</h3>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          generated for this role
        </span>
      </div>
      <div className="space-y-2">
        {questions.map((q, i) => {
          const gap = q.tag?.startsWith("gap");
          return (
            <div
              key={i}
              className="rounded-lg border border-border bg-card/40 p-3.5 transition-colors hover:bg-card/70"
            >
              <p className="text-sm leading-relaxed text-foreground/90">{q.question}</p>
              <Badge variant={gap ? "low" : "good"} className="mt-2 font-mono text-[10px]">
                {q.tag}
              </Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}
