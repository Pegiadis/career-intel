export function ObservabilityHeader({ model, tokens, latency }:
  { model: string; tokens: number; latency: number }) {
  return (
    <div className="ml-auto flex gap-2 items-center text-slate-400 text-[11px]">
      model: {model} · {tokens} tok · {latency}ms
    </div>);
}
