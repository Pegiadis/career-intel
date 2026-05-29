import type { FitOut } from "@/lib/types";
import { InterviewPrep } from "./InterviewPrep";

function Bar({ label, pct, right }: { label: string; pct: number; right: string }) {
  return (
    <div className="flex items-center gap-2 my-1 text-[11px]">
      <span className="w-28">{label}</span>
      <div className="flex-1 h-[7px] bg-slate-200 rounded overflow-hidden">
        <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} /></div>
      <span>{right}</span>
    </div>);
}

export function FitDashboard({ fit, company, title }:
  { fit: FitOut; company: string; title: string }) {
  const s = fit.sub_scores;
  return (
    <div>
      <div className="flex gap-4 items-center">
        <div className="w-24 h-24 rounded-full flex items-center justify-center text-2xl font-extrabold text-green-700"
          style={{ background: `radial-gradient(closest-side,#fff 78%,transparent 79%),conic-gradient(#1a7f4b ${fit.fit_score}%,#edeff3 0)` }}>
          {fit.fit_score}</div>
        <div className="flex-1">
          <div className="font-bold mb-1">{company} — {title}</div>
          <Bar label="Required skills" pct={s.required_coverage * 100}
               right={`${fit.matched_skills.length}/${fit.matched_skills.length + fit.missing_skills.length}`} />
          <Bar label="Nice-to-have" pct={s.nice_to_have_coverage * 100} right={`${Math.round(s.nice_to_have_coverage*100)}%`} />
          <Bar label="Seniority match" pct={s.seniority_match * 100} right={s.seniority_match >= 1 ? "Senior ✓" : "Partial"} />
        </div>
      </div>

      <div className="mt-4"><h4 className="text-xs font-semibold mb-1.5">✅ Matched skills</h4>
        {fit.matched_skills.map((sk) => (
          <span key={sk} className="inline-block bg-green-100 text-green-700 rounded-full px-2 py-0.5 text-[11px] m-0.5">{sk}</span>))}
      </div>
      <div className="mt-3"><h4 className="text-xs font-semibold mb-1.5">⚠️ Missing / weak</h4>
        {fit.missing_skills.map((sk) => (
          <span key={sk} className="inline-block bg-red-100 text-red-600 rounded-full px-2 py-0.5 text-[11px] m-0.5">{sk}</span>))}
      </div>
      <div className="mt-4"><h4 className="text-xs font-semibold mb-1.5">Fit summary</h4>
        <div className="bg-slate-50 border-l-[3px] border-blue-500 rounded p-2.5 text-[11.5px] leading-relaxed">{fit.summary}</div>
      </div>
      <InterviewPrep questions={fit.interview_questions} />
    </div>);
}
