"use client";
import { useRef, useState, type ReactNode } from "react";
import { MessageSquareText, Send, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { streamChat } from "@/lib/sse";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface Msg { role: "me" | "ai"; text: string; }

const CITE = /(\[[^\]]*§[^\]]*\])/g;

// Turn `[resume §skills]` tokens inside any string into styled chips, recursively,
// so citations render correctly even inside markdown paragraphs, list items, and tables.
function withCitations(children: ReactNode): ReactNode {
  if (typeof children === "string") {
    return children.split(CITE).map((part, i) =>
      /^\[[^\]]*§[^\]]*\]$/.test(part) ? (
        <span
          key={i}
          title="Source citation"
          className="mx-0.5 inline-flex cursor-help items-center rounded bg-primary/10 px-1.5 py-0.5 align-baseline font-mono text-[10px] font-medium text-primary"
        >
          {part.replace(/[[\]]/g, "")}
        </span>
      ) : (
        part
      ),
    );
  }
  if (Array.isArray(children)) return children.map((c, i) => <span key={i}>{withCitations(c)}</span>);
  return children;
}

const MD_COMPONENTS = {
  p: ({ children }: { children?: ReactNode }) => (
    <p className="mb-2 last:mb-0 leading-relaxed">{withCitations(children)}</p>
  ),
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold">{withCitations(children)}</strong>
  ),
  em: ({ children }: { children?: ReactNode }) => <em>{withCitations(children)}</em>,
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="mb-2 ml-4 list-disc space-y-1">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="mb-2 ml-4 list-decimal space-y-1">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => <li>{withCitations(children)}</li>,
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary underline">
      {children}
    </a>
  ),
  code: ({ children }: { children?: ReactNode }) => (
    <code className="rounded bg-secondary px-1 py-0.5 font-mono text-[11px]">{children}</code>
  ),
  pre: ({ children }: { children?: ReactNode }) => (
    <pre className="mb-2 overflow-x-auto rounded-lg bg-secondary p-3 text-[11px]">{children}</pre>
  ),
  table: ({ children }: { children?: ReactNode }) => (
    <div className="mb-2 overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: ReactNode }) => (
    <thead className="bg-secondary">{children}</thead>
  ),
  th: ({ children }: { children?: ReactNode }) => (
    <th className="border border-border px-2 py-1 text-left font-semibold">{withCitations(children)}</th>
  ),
  td: ({ children }: { children?: ReactNode }) => (
    <td className="border border-border px-2 py-1 align-top">{withCitations(children)}</td>
  ),
  h1: ({ children }: { children?: ReactNode }) => (
    <h3 className="mb-1 mt-2 font-display text-base">{withCitations(children)}</h3>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h3 className="mb-1 mt-2 font-display text-base">{withCitations(children)}</h3>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h4 className="mb-1 mt-2 font-semibold">{withCitations(children)}</h4>
  ),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="mb-2 border-l-2 border-primary/40 pl-3 text-foreground/70">
      {children}
    </blockquote>
  ),
};

function renderAnswer(text: string) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
      {text}
    </ReactMarkdown>
  );
}

export function ChatPanel({ resumeId, jobId }: { resumeId: number | null; jobId: number | null }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const scrollDown = () =>
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));

  const send = async () => {
    if (!input.trim() || resumeId == null || streaming) return;
    const q = input;
    setInput("");
    setMsgs((m) => [...m, { role: "me", text: q }, { role: "ai", text: "" }]);
    setStreaming(true);
    scrollDown();
    try {
      await streamChat({ resume_id: resumeId, job_id: jobId, question: q }, (tok) => {
        setMsgs((m) => {
          const copy = [...m];
          copy[copy.length - 1].text += tok;
          return copy;
        });
        scrollDown();
      });
    } catch {
      toast.error("Chat request failed. Is the API running?");
    } finally {
      setStreaming(false);
    }
  };

  const disabled = resumeId == null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <MessageSquareText className="size-4 text-primary" />
        <span className="text-sm font-medium">Chat</span>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          grounded
        </span>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-3 p-4">
          {msgs.length === 0 && (
            <div className="mt-10 flex flex-col items-center gap-2 text-center">
              <div className="grid size-10 place-items-center rounded-full border border-border bg-card">
                <Sparkles className="size-4 text-primary" />
              </div>
              <p className="max-w-[14rem] text-xs leading-relaxed text-muted-foreground">
                {disabled
                  ? "Upload a résumé to start chatting about fit and gaps."
                  : "Ask anything — answers cite your résumé and the job description."}
              </p>
            </div>
          )}
          {msgs.map((m, i) => {
            const last = i === msgs.length - 1;
            return (
              <div
                key={i}
                className={cn(
                  "max-w-[90%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed animate-fade-up",
                  m.role === "me"
                    ? "ml-auto rounded-br-md bg-primary text-primary-foreground"
                    : "rounded-bl-md border border-border bg-card text-foreground/90",
                )}
              >
                {m.role === "ai" ? renderAnswer(m.text) : m.text}
                {m.role === "ai" && last && streaming && (
                  <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse-soft bg-primary" />
                )}
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2">
          <Input
            value={input}
            disabled={disabled || streaming}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={disabled ? "Upload a résumé first…" : "Ask about fit, gaps, or prep…"}
          />
          <Button size="icon" onClick={send} disabled={disabled || streaming || !input.trim()}>
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
