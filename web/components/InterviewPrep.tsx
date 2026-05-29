import type { FitOut } from "@/lib/types";
export function InterviewPrep({ questions }: { questions: FitOut["interview_questions"] }) {
  return (
    <div className="border border-slate-200 rounded-lg p-2.5 mt-4">
      <h4 className="text-xs font-semibold mb-1.5">🎯 Interview prep — generated for this role</h4>
      {questions.map((q, i) => (
        <div key={i} className="py-1.5 border-b border-dashed border-slate-100 last:border-0 text-xs">
          "{q.question}" <span className="text-[9px] bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">{q.tag}</span>
        </div>))}
    </div>);
}
