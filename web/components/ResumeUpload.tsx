"use client";
import { useRef, useState } from "react";
import { FileText, Loader2, UploadCloud, CheckCircle2 } from "lucide-react";
import { uploadResume } from "@/lib/api";
import type { ResumeOut } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ResumeUpload({ onUploaded }: { onUploaded: (r: ResumeOut) => void }) {
  const [resume, setResume] = useState<ResumeOut | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = async (f: File) => {
    setLoading(true);
    try {
      const r = await uploadResume(f);
      setResume(r);
      onUploaded(r);
    } finally {
      setLoading(false);
    }
  };

  if (resume) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-good/25 bg-good/5 p-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-good/15 text-good">
          <FileText className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{resume.filename}</p>
          <p className="mt-0.5 flex items-center gap-1 font-mono text-[10px] text-muted-foreground tnum">
            <CheckCircle2 className="size-3 text-good" />
            {resume.section_count} sections · {resume.chunk_count} chunks
          </p>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => inputRef.current?.click()}
      disabled={loading}
      className={cn(
        "group flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-background/30 px-3 py-6 text-center transition-all",
        "hover:border-primary/60 hover:bg-primary/5 disabled:opacity-60",
      )}
    >
      {loading ? (
        <Loader2 className="size-5 animate-spin text-primary" />
      ) : (
        <UploadCloud className="size-5 text-muted-foreground transition-colors group-hover:text-primary" />
      )}
      <span className="text-xs text-muted-foreground">
        {loading ? "Embedding…" : "Drop a résumé PDF"}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handle(f);
        }}
      />
    </button>
  );
}
