import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Wand2, Film } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { NotReady, OfflineNotice } from "@/components/NotReady";
import { ProbabilityBars } from "@/components/ProbabilityBars";
import { api, ApiError, type ClassifyResponse } from "@/lib/api";
import { useHealth } from "@/hooks/useHealth";

export const Route = createFileRoute("/genre")({
  head: () => ({
    meta: [
      { title: "Genre Guesser — CineSquad" },
      { name: "description", content: "Paste a plot, get a genre. Playful ML-powered guessing." },
      { property: "og:title", content: "Genre Guesser — CineSquad" },
      { property: "og:description", content: "Paste a plot, get a genre." },
    ],
  }),
  component: GenrePage,
});

function GenrePage() {
  return (
    <AppShell>
      <Genre />
    </AppShell>
  );
}

function Genre() {
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
      const res = await api.classify(text.trim());
      setResult(res);
    } catch (err) {
      if (err instanceof ApiError && err.kind === "not_ready") {
        setError("still training! the genre model isn't ready yet.");
      } else if (err instanceof ApiError && err.kind === "network") {
        setError("can't reach the backend.");
      } else {
        setError("something went sideways. try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (!online) return <PageWrap><OfflineNotice /></PageWrap>;
  if (!health.classification_ready) return <PageWrap><NotReady /></PageWrap>;

  return (
    <PageWrap>
      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/15 text-primary px-3 py-1 text-xs font-medium mb-3">
            <Wand2 className="h-3.5 w-3.5" /> Genre Guesser
          </div>
          <h1 className="font-display text-4xl md:text-5xl">what genre is this?</h1>
          <p className="text-muted-foreground mt-2">
            paste a plot summary. we'll shake the magic 8-reel and call it.
          </p>
        </header>

        <form onSubmit={submit} className="rounded-3xl border border-border bg-card p-4 shadow-card">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="A group of dream thieves must plant an idea deep in a target's subconscious…"
            className="w-full resize-none bg-transparent p-2 text-sm outline-none placeholder:text-muted-foreground/70"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading || !text.trim()}
              className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold shadow-glow hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:hover:scale-100"
            >
              <Wand2 className="h-4 w-4" />
              {loading ? "Guessing…" : "Guess the Genre!"}
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
              className="mt-8"
            >
              <motion.div
                initial={{ rotateX: 90, opacity: 0 }}
                animate={{ rotateX: 0, opacity: 1 }}
                transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
                style={{ transformStyle: "preserve-3d" }}
                className="rounded-3xl bg-gradient-to-br from-primary via-primary to-primary/70 p-1 shadow-glow"
              >
                <div className="rounded-[calc(1.5rem-4px)] bg-card px-8 py-10 text-center">
                  <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                    the verdict is in
                  </div>
                  <div className="mt-3 flex items-center justify-center gap-3">
                    <Film className="h-8 w-8 text-primary" />
                    <div className="font-display text-5xl md:text-6xl text-primary">
                      {result.label}
                    </div>
                  </div>
                </div>
              </motion.div>

              <div className="mt-8 rounded-3xl border border-border bg-card/60 p-6">
                <div className="text-xs uppercase tracking-widest text-muted-foreground mb-4">
                  full breakdown
                </div>
                <ProbabilityBars probabilities={result.probabilities} highlight={result.label} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageWrap>
  );
}

function PageWrap({ children }: { children: React.ReactNode }) {
  return <div className="px-5 md:px-10 py-8 md:py-12">{children}</div>;
}
