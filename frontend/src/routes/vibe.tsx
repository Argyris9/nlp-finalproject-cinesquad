import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Smile } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { NotReady, OfflineNotice } from "@/components/NotReady";
import { ProbabilityBars } from "@/components/ProbabilityBars";
import { api, ApiError, type ClassifyResponse } from "@/lib/api";
import { useHealth } from "@/hooks/useHealth";

export const Route = createFileRoute("/vibe")({
  head: () => ({
    meta: [
      { title: "Vibe Check — CineSquad" },
      { name: "description", content: "Read the room of any movie review with sentiment analysis." },
      { property: "og:title", content: "Vibe Check — CineSquad" },
      { property: "og:description", content: "Positive or negative? Get a fun sentiment read." },
    ],
  }),
  component: VibePage,
});

function VibePage() {
  return (
    <AppShell>
      <Vibe />
    </AppShell>
  );
}

function Vibe() {
  const { health, online } = useHealth();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ClassifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.sentiment(text.trim()));
    } catch (err) {
      if (err instanceof ApiError && err.kind === "not_ready") setError("still training! the vibe check isn't ready.");
      else if (err instanceof ApiError && err.kind === "network") setError("can't reach the backend.");
      else setError("something jammed. try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!online) return <Wrap><OfflineNotice /></Wrap>;
  if (!health.sentiment_ready) return <Wrap><NotReady /></Wrap>;

  // score positioning: try to detect "positive" and derive meter position
  const label = result?.label.toLowerCase() ?? "";
  const positive = /pos|good|great|love|happy|1|4|5/.test(label);
  const negative = /neg|bad|hate|sad|0|1/.test(label) && !positive;
  const confidence = result
    ? Math.max(...Object.values(result.probabilities))
    : 0;
  const meterPos = positive ? 90 : negative ? 10 : 50;

  return (
    <Wrap>
      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/15 text-primary px-3 py-1 text-xs font-medium mb-3">
            <Smile className="h-3.5 w-3.5" /> Vibe Check
          </div>
          <h1 className="font-display text-4xl md:text-5xl">how'd it feel?</h1>
          <p className="text-muted-foreground mt-2">
            paste a movie review — we'll tell you if it's a rave or a rant.
          </p>
        </header>

        <form onSubmit={submit} className="rounded-3xl border border-border bg-card p-4 shadow-card">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="I laughed, I cried, I ate three buckets of popcorn…"
            className="w-full resize-none bg-transparent p-2 text-sm outline-none placeholder:text-muted-foreground/70"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading || !text.trim()}
              className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold shadow-glow hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:hover:scale-100"
            >
              <Smile className="h-4 w-4" />
              {loading ? "Reading the room…" : "Check the Vibe"}
            </button>
          </div>
        </form>

        {error && (
          <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 rounded-3xl border border-border bg-card p-8 shadow-card"
            >
              <div className="text-center">
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 180, damping: 12 }}
                  className="text-7xl mb-2"
                >
                  {positive ? "😄" : negative ? "😾" : "🤔"}
                </motion.div>
                <div className="font-display text-3xl capitalize text-primary">{result.label}</div>
                <div className="text-sm text-muted-foreground mt-1">
                  {(confidence <= 1 ? confidence * 100 : confidence).toFixed(1)}% confident
                </div>
              </div>

              <div className="mt-8">
                <div className="relative h-3 rounded-full bg-gradient-to-r from-destructive via-muted to-success">
                  <motion.div
                    initial={{ left: "50%" }}
                    animate={{ left: `${meterPos}%` }}
                    transition={{ type: "spring", stiffness: 100, damping: 14 }}
                    className="absolute -top-1 h-5 w-5 -translate-x-1/2 rounded-full bg-foreground shadow-lg border-2 border-background"
                  />
                </div>
                <div className="flex justify-between text-[10px] uppercase tracking-widest text-muted-foreground mt-2">
                  <span>👎 rant</span>
                  <span>meh</span>
                  <span>rave 👍</span>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-border">
                <div className="text-xs uppercase tracking-widest text-muted-foreground mb-4">
                  full breakdown
                </div>
                <ProbabilityBars probabilities={result.probabilities} highlight={result.label} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="px-5 md:px-10 py-8 md:py-12">{children}</div>;
}
