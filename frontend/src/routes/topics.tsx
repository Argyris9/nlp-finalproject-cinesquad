import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Compass, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { NotReady, OfflineNotice } from "@/components/NotReady";
import { api, ApiError, type Topic } from "@/lib/api";
import { useHealth } from "@/hooks/useHealth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/topics")({
  head: () => ({
    meta: [
      { title: "Explore Topics — CineSquad" },
      { name: "description", content: "Wander through the topics our model has discovered in film." },
      { property: "og:title", content: "Explore Topics — CineSquad" },
      { property: "og:description", content: "Discovered topics with keyword pills." },
    ],
  }),
  component: TopicsPage,
});

function TopicsPage() {
  return (
    <AppShell>
      <Topics />
    </AppShell>
  );
}

function Topics() {
  const { health, online } = useHealth();
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [classifying, setClassifying] = useState(false);
  const [result, setResult] = useState<Topic | null>(null);
  const [classifyError, setClassifyError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    if (!online || !health.topic_modeling_ready) return;
    let cancelled = false;
    api
      .topics()
      .then((t) => !cancelled && setTopics(t))
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.kind === "not_ready") setError("not_ready");
        else setError("Something went wrong loading topics.");
      });
    return () => {
      cancelled = true;
    };
  }, [online, health.topic_modeling_ready]);

  async function classify(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || classifying) return;
    setClassifying(true);
    setClassifyError(null);
    setResult(null);
    try {
      const r = await api.classifyTopic(text.trim());
      setResult(r);
      setSelected(r.topic_id);
    } catch (err) {
      if (err instanceof ApiError && err.kind === "not_ready") setClassifyError("still training!");
      else if (err instanceof ApiError && err.kind === "network") setClassifyError("can't reach the backend.");
      else setClassifyError("something went sideways.");
    } finally {
      setClassifying(false);
    }
  }

  if (!online) return <Wrap><OfflineNotice /></Wrap>;
  if (!health.topic_modeling_ready || error === "not_ready") return <Wrap><NotReady /></Wrap>;

  return (
    <Wrap>
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/15 text-primary px-3 py-1 text-xs font-medium mb-3">
            <Compass className="h-3.5 w-3.5" /> Explore Topics
          </div>
          <h1 className="font-display text-4xl md:text-5xl">what themes hide in the reels?</h1>
          <p className="text-muted-foreground mt-2">
            each card is a cluster our model found. tap one to spotlight it.
          </p>
        </header>

        {/* Classifier */}
        <form
          onSubmit={classify}
          className="rounded-3xl border border-border bg-card p-4 shadow-card mb-8"
        >
          <div className="flex items-center gap-2 mb-2 text-xs uppercase tracking-widest text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            classify some text
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="paste a plot, a scene, a description — we'll find its topic."
            className="w-full resize-none bg-transparent p-2 text-sm outline-none placeholder:text-muted-foreground/70"
          />
          <div className="flex items-center justify-between gap-3">
            {classifyError && (
              <div className="text-xs text-destructive">{classifyError}</div>
            )}
            {result && !classifyError && (
              <div className="text-xs text-muted-foreground">
                → matched <span className="text-primary font-semibold">{result.topic_label ?? `Topic #${result.topic_id}`}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={classifying || !text.trim()}
              className="ml-auto inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold shadow-glow hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:hover:scale-100"
            >
              {classifying ? "Classifying…" : "Find topic"}
            </button>
          </div>
        </form>

        {/* Grid */}
        {!topics ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-40 rounded-3xl border border-border bg-card/40 animate-pulse" />
            ))}
          </div>
        ) : topics.length === 0 ? (
          <NotReady title="no topics yet" subtitle="the model didn't return any topics." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence>
              {topics.map((t, i) => (
                <motion.button
                  key={t.topic_id}
                  onClick={() => setSelected(selected === t.topic_id ? null : t.topic_id)}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  whileHover={{ y: -4 }}
                  className={cn(
                    "text-left rounded-3xl border p-5 transition-all bg-card shadow-card",
                    selected === t.topic_id
                      ? "border-primary shadow-glow"
                      : "border-border hover:border-primary/50",
                  )}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-mono">
                      Topic #{t.topic_id}
                    </div>
                    <div className="h-6 w-6 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center">
                      {String(t.topic_id).padStart(2, "0")}
                    </div>
                  </div>
                  <h3 className="font-display text-xl mb-3 leading-tight">
                    {t.topic_label ?? `Topic #${t.topic_id}`}
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {t.top_words.slice(0, 8).map((w) => (
                      <span
                        key={w}
                        className="text-[11px] rounded-full bg-muted px-2.5 py-0.5 text-foreground/80"
                      >
                        {w}
                      </span>
                    ))}
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="px-5 md:px-10 py-8 md:py-12">{children}</div>;
}
