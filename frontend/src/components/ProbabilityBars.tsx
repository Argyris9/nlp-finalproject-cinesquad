import { motion } from "framer-motion";

export function ProbabilityBars({
  probabilities,
  highlight,
}: {
  probabilities: Record<string, number>;
  highlight?: string;
}) {
  const entries = Object.entries(probabilities).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, v]) => v), 0.0001);
  return (
    <div className="flex flex-col gap-2">
      {entries.map(([label, value]) => {
        const pct = (value <= 1 ? value * 100 : value);
        const rel = (value / max) * 100;
        const active = highlight && label.toLowerCase() === highlight.toLowerCase();
        return (
          <div key={label} className="grid grid-cols-[110px_1fr_50px] items-center gap-3 text-sm">
            <span className={active ? "font-semibold text-primary" : "text-foreground/80"}>{label}</span>
            <div className="h-2.5 rounded-full bg-muted overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(2, rel)}%` }}
                transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
                className={active ? "h-full bg-primary" : "h-full bg-foreground/30"}
              />
            </div>
            <span className="text-xs tabular-nums font-mono text-muted-foreground text-right">
              {pct.toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
