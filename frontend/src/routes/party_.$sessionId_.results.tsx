import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Info, Send, Ticket, Trophy } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Mascot } from "@/components/Mascot";
import { NotReady, OfflineNotice } from "@/components/NotReady";
import { TypingIndicator } from "@/components/TypingIndicator";
import {
  api,
  ApiError,
  type RecommendationItem,
  type RetrievedMovieRef,
} from "@/lib/api";
import { useHealth } from "@/hooks/useHealth";
import { useParty } from "@/hooks/useParty";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/party_/$sessionId_/results")({
  component: ResultsPage,
});

const LOADING_CAPTIONS = [
  "rewinding the tape…",
  "polling everyone's taste in secret…",
  "arguing with itself about genres…",
  "checking the group's collective vibe…",
];

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: RetrievedMovieRef[];
};

function ResultsPage() {
  return (
    <AppShell>
      <Results />
    </AppShell>
  );
}

function Results() {
  const { sessionId } = Route.useParams();
  const { health, online } = useHealth();
  const { identity } = useParty();

  const [recommendations, setRecommendations] = useState<RecommendationItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [captionIdx, setCaptionIdx] = useState(0);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!identity || identity.sessionId !== sessionId) return;
    let cancelled = false;
    api
      .recommend(sessionId)
      .then((res) => !cancelled && setRecommendations(res.recommendations))
      .catch((err) => !cancelled && setLoadError(err instanceof ApiError ? err.message : "couldn't get recommendations."));
    return () => {
      cancelled = true;
    };
  }, [sessionId, identity]);

  useEffect(() => {
    if (recommendations) return;
    const interval = setInterval(() => setCaptionIdx((i) => (i + 1) % LOADING_CAPTIONS.length), 2200);
    return () => clearInterval(interval);
  }, [recommendations]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, chatLoading]);

  async function sendChat() {
    const text = input.trim();
    if (!text || chatLoading || !identity || !recommendations) return;
    setChatError(null);
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text }]);
    setInput("");
    setChatLoading(true);
    try {
      const res = await api.groupChat(
        sessionId,
        identity.userId,
        text,
        recommendations.map((r) => r.movie_id),
      );
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", text: res.answer, sources: res.retrieved_movies }]);
    } catch (err) {
      setChatError(err instanceof ApiError ? err.message : "something jammed the projector. try again.");
    } finally {
      setChatLoading(false);
    }
  }

  if (!online) return <Wrap><OfflineNotice /></Wrap>;
  if (!health.group_recommender_ready) return <Wrap><NotReady /></Wrap>;
  if (!identity || identity.sessionId !== sessionId) {
    return (
      <Wrap>
        <NotReady title="join the party first" subtitle="head back to the room and join before viewing results." />
      </Wrap>
    );
  }
  if (loadError) {
    return (
      <Wrap>
        <NotReady title="couldn't get recommendations" subtitle={loadError} />
      </Wrap>
    );
  }
  if (!recommendations) {
    return (
      <Wrap>
        <div className="mx-auto max-w-md pt-16 text-center flex flex-col items-center gap-4">
          <Mascot size={64} />
          <AnimatePresence mode="wait">
            <motion.p key={captionIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-muted-foreground">
              {LOADING_CAPTIONS[captionIdx]}
            </motion.p>
          </AnimatePresence>
        </div>
      </Wrap>
    );
  }

  return (
    <Wrap>
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/15 text-primary px-3 py-1 text-xs font-medium mb-3">
            <Trophy className="h-3.5 w-3.5" /> tonight's picks
          </div>
          <h1 className="font-display text-3xl md:text-4xl">the squad's verdict</h1>
          <p className="text-muted-foreground mt-2">ranked by how well they fit everyone, not just the loudest opinion.</p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
          <AnimatePresence>
            {recommendations.map((rec, i) => (
              <RecommendationCard key={rec.movie_id} rec={rec} index={i} />
            ))}
          </AnimatePresence>
        </div>

        <div className="rounded-3xl border border-border bg-card shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border/60">
            <h2 className="font-display text-xl">not feeling it?</h2>
            <p className="text-xs text-muted-foreground mt-1">ask for something darker, shorter, no horror — whatever the squad wants.</p>
          </div>

          <div ref={scrollRef} className="max-h-[420px] overflow-y-auto px-5 py-4 flex flex-col gap-4">
            {messages.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">no follow-ups yet — try "give us something darker" or "remove horror".</p>
            )}
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <ChatBubble key={m.id} message={m} />
              ))}
            </AnimatePresence>
            {chatLoading && (
              <div className="flex items-end gap-2">
                <Mascot size={28} />
                <TypingIndicator />
              </div>
            )}
          </div>

          <div className="border-t border-border/60 px-5 py-4">
            {chatError && (
              <div className="mb-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm">{chatError}</div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendChat();
              }}
              className="flex items-end gap-2 rounded-2xl border border-border bg-background p-2 pl-4"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="ask the squad's assistant for a tweak…"
                className="flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground/70"
                disabled={chatLoading}
              />
              <button
                type="submit"
                disabled={chatLoading || !input.trim()}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-glow hover:scale-105 active:scale-95 transition-all disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </Wrap>
  );
}

function RecommendationCard({ rec, index }: { rec: RecommendationItem; index: number }) {
  const [showDetail, setShowDetail] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      whileHover={{ y: -4 }}
      className="rounded-3xl border border-border bg-card p-5 shadow-card flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-xl leading-tight">{rec.title}</h3>
          <p className="text-xs text-muted-foreground">{rec.year ?? "year unknown"}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            rec.confidence === "High" && "bg-success/20 text-success",
            (rec.confidence === "Medium" || rec.confidence === "Low-Medium") && "bg-popcorn/25 text-reel",
            rec.confidence === "Medium-Low" && "bg-muted text-muted-foreground",
          )}
        >
          {rec.confidence}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {rec.genres.map((g) => (
          <span key={g} className="text-[11px] rounded-full bg-muted px-2.5 py-0.5 text-foreground/80">
            {g}
          </span>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="uppercase tracking-widest text-muted-foreground">group match</span>
          <span className="font-mono font-semibold text-primary">{rec.group_match_percentage}%</span>
        </div>
        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${rec.group_match_percentage}%` }}
            transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
            className="h-full bg-primary rounded-full"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {rec.individual_scores.map((s) => (
          <div key={s.user_id} className="grid grid-cols-[70px_1fr_36px] items-center gap-2 text-xs">
            <span className="truncate text-foreground/70">{s.display_name}</span>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-foreground/30 rounded-full" style={{ width: `${s.match_percentage}%` }} />
            </div>
            <span className="font-mono text-muted-foreground text-right">{s.match_percentage}%</span>
          </div>
        ))}
      </div>

      <p className="text-sm text-foreground/80">{rec.explanation}</p>

      <button
        type="button"
        onClick={() => setShowDetail((v) => !v)}
        className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-primary transition self-start"
      >
        <Info className="h-3 w-3" />
        {showDetail ? "hide data sources" : "data sources"}
      </button>
      <AnimatePresence>
        {showDetail && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="text-[11px] text-muted-foreground leading-relaxed overflow-hidden"
          >
            {rec.data_status_message}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
      className={cn("flex gap-2 items-end", isUser ? "justify-end" : "justify-start")}
    >
      {!isUser && <Mascot size={28} className="shrink-0" />}
      <div className={cn("flex flex-col gap-2 max-w-[85%]", isUser && "items-end")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-card whitespace-pre-wrap",
            isUser ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted text-foreground rounded-bl-md",
          )}
        >
          {message.text}
        </div>
        {message.sources && message.sources.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
            {message.sources.map((s, i) => (
              <div
                key={i}
                className="ticket-notch snap-start shrink-0 min-w-[150px] bg-gradient-to-br from-card to-muted border border-border/60 px-3 py-2"
              >
                <div className="text-[9px] uppercase tracking-[0.2em] text-primary font-semibold flex items-center gap-1">
                  <Ticket className="h-2.5 w-2.5" /> admit one
                </div>
                <div className="text-xs font-medium truncate">{s.title}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="px-5 md:px-10 py-8 md:py-12">{children}</div>;
}
