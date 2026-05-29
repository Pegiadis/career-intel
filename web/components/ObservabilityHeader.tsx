import { Activity, Cpu, Timer } from "lucide-react";

export function ObservabilityHeader({ model, tokens, latency }:
  { model: string; tokens: number; latency: number }) {
  const Pill = ({ icon, label }: { icon: React.ReactNode; label: string }) => (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/40 px-2.5 py-1 font-mono text-[11px] text-muted-foreground tnum">
      {icon}
      {label}
    </span>
  );
  return (
    <div className="ml-auto hidden items-center gap-2 sm:flex">
      <Pill icon={<Cpu className="size-3 text-primary/80" />} label={model} />
      <Pill icon={<Activity className="size-3 text-primary/80" />} label={`${tokens.toLocaleString()} tok`} />
      <Pill icon={<Timer className="size-3 text-primary/80" />} label={`${latency} ms`} />
    </div>
  );
}
