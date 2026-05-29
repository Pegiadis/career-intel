"use client";
import { useState } from "react";
import { streamChat } from "@/lib/sse";

interface Msg { role: "me" | "ai"; text: string; }

export function ChatPanel({ resumeId, jobId }: { resumeId: number | null; jobId: number | null }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");

  const send = async () => {
    if (!input.trim() || resumeId == null) return;
    const q = input; setInput("");
    setMsgs((m) => [...m, { role: "me", text: q }, { role: "ai", text: "" }]);
    await streamChat({ resume_id: resumeId, job_id: jobId, question: q }, (tok) => {
      setMsgs((m) => {
        const copy = [...m]; copy[copy.length - 1].text += tok; return copy; });
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-slate-100 font-semibold text-[11px]">💬 Chat · grounded in resume + JD</div>
      <div className="flex-1 p-3 overflow-auto space-y-2">
        {msgs.map((m, i) => (
          <div key={i} className={`rounded-xl px-2.5 py-1.5 text-[11px] leading-snug max-w-[88%]
            ${m.role === "me" ? "bg-slate-900 text-white ml-auto" : "bg-blue-50 text-slate-800"}`}>
            {m.text || "…"}</div>))}
      </div>
      <div className="p-2.5 border-t border-slate-100">
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about fit, gaps, or prep…"
          className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-[11px]" />
      </div>
    </div>);
}
