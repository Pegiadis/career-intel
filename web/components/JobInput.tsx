"use client";
import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { addJob } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function JobInput({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <Button
        variant="outline"
        className="w-full border-dashed text-muted-foreground hover:text-primary"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" /> Add job description
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card/60 p-3">
      <Input placeholder="Company" value={company} onChange={(e) => setCompany(e.target.value)} />
      <Input placeholder="Role title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Textarea
        placeholder="Paste the job description…"
        className="min-h-[96px] text-xs"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          className="flex-1"
          disabled={busy || !company || !text}
          onClick={async () => {
            setBusy(true);
            try {
              await addJob({ title, company, text });
              setOpen(false);
              setTitle(""); setCompany(""); setText("");
              onAdded();
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {busy ? "Analyzing…" : "Add & analyze"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
