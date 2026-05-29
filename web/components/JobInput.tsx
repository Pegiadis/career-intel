"use client";
import { useState } from "react";
import { addJob } from "@/lib/api";

export function JobInput({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(""); const [company, setCompany] = useState("");
  const [text, setText] = useState("");
  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="w-full border border-dashed border-slate-300 rounded-lg py-1.5 text-blue-500 text-xs mt-1">
      + Add job description</button>);
  return (
    <div className="border border-slate-200 rounded-lg p-2 mt-1 space-y-1">
      <input className="w-full border rounded px-1 text-xs" placeholder="Company"
        value={company} onChange={(e) => setCompany(e.target.value)} />
      <input className="w-full border rounded px-1 text-xs" placeholder="Title"
        value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="w-full border rounded px-1 text-xs h-20" placeholder="Paste JD…"
        value={text} onChange={(e) => setText(e.target.value)} />
      <button className="bg-slate-900 text-white rounded px-2 py-1 text-xs"
        onClick={async () => { await addJob({ title, company, text });
          setOpen(false); setTitle(""); setCompany(""); setText(""); onAdded(); }}>
        Add</button>
    </div>);
}
