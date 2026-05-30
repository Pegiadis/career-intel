"use client";
import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "error" | "success" | "info";
type Toast = { id: number; message: string; variant: Variant };

let listeners: Array<(t: Toast[]) => void> = [];
let toasts: Toast[] = [];
let seq = 1;

function emit() {
  for (const l of listeners) l([...toasts]);
}
function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}
function push(message: string, variant: Variant) {
  const t = { id: seq++, message, variant };
  toasts = [...toasts, t];
  emit();
  setTimeout(() => dismiss(t.id), 5000);
}

export const toast = {
  error: (m: string) => push(m, "error"),
  success: (m: string) => push(m, "success"),
  info: (m: string) => push(m, "info"),
};

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    listeners.push(setItems);
    return () => {
      listeners = listeners.filter((l) => l !== setItems);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2">
      {items.map((t) => {
        const Icon = t.variant === "error" ? AlertCircle : t.variant === "success" ? CheckCircle2 : Info;
        return (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex animate-fade-up items-start gap-2.5 rounded-lg border bg-card px-3.5 py-3 text-sm shadow-lg",
              t.variant === "error" && "border-low/30",
              t.variant === "success" && "border-good/30",
              t.variant === "info" && "border-border",
            )}
          >
            <Icon
              className={cn(
                "mt-0.5 size-4 shrink-0",
                t.variant === "error" && "text-low",
                t.variant === "success" && "text-good",
                t.variant === "info" && "text-primary",
              )}
            />
            <span className="flex-1 leading-snug text-foreground/90">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
