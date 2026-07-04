import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Send, Trash2, Ticket } from "lucide-react";
import { api, ApiError, type ChatSource } from "@/lib/api";
import { useChatHistory, type ChatMessage } from "@/hooks/useChatHistory";
import { useHealth } from "@/hooks/useHealth";
import { Mascot } from "@/components/Mascot";
import { TypingIndicator } from "@/components/TypingIndicator";
import { NotReady, OfflineNotice } from "@/components/NotReady";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "What is Titanic about?",
  "Recommend me something like a heist movie",
  "Which sci-fi film has the best twist ending?",
  "Give me a cozy rainy-day watch",
];

export function ChatView() {
  const { messages, append, clear } = useChatHistory();
  const { health, online } = useHealth();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    setError(null);
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: q,
      createdAt: Date.now(),
    };
    const history = messages.map((m) => ({ role: m.role, text: m.text }));
    append(userMsg);
    setInput("");
    setLoading(true);
    try {
      const res = await api.chat(q, history);
      append({
        id: crypto.randomUUID(),
        role: "assistant",
        text: res.answer,
        sources: res.sources,
        createdAt: Date.now(),
      });
    } catch (err) {
      if (err instanceof ApiError && err.kind === "not_ready") {
        setError("still training! the chat brain isn't ready yet — check back soon 🎬");
      } else if (err instanceof ApiError && err.kind === "network") {
        setError("can't reach the backend. is your FastAPI server running?");
      } else {
        setError("something jammed the projector. try again in a sec.");
      }
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  const showNotReady = !health.rag_ready && online && messages.length === 0;
  const showOffline = !online && messages.length === 0;

  return (
    <div className="flex flex-col h-[100dvh] md:h-screen">
      <header className="flex items-center justify-between px-5 md:px-8 py-4 border-b border-border/60 bg-background/60 backdrop-blur">
        <div>
          <h1 className="font-display text-2xl">Chat with the squad's cinephile</h1>
          <p className="text-xs text-muted-foreground">
            {health.rag_ready ? "ask about any movie, plot, cast, or vibe." : "warming up the reels…"}
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clear}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition"
          >
            <Trash2 className="h-3.5 w-3.5" />
            clear
          </button>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
        {showOffline ? (
          <div className="pt-16">
            <OfflineNotice />
          </div>
        ) : showNotReady ? (
          <div className="pt-16">
            <NotReady
              title="the chat brain is still training"
              subtitle="poll's on — this section will unlock the moment the model's ready."
            />
          </div>
        ) : messages.length === 0 ? (
          <EmptyState onPick={send} disabled={loading} />
        ) : (
          <div className="mx-auto max-w-3xl flex flex-col gap-4">
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <Bubble key={m.id} message={m} />
              ))}
            </AnimatePresence>
            {loading && (
              <div className="flex items-end gap-2">
                <Mascot size={32} />
                <TypingIndicator />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border/60 bg-background/80 backdrop-blur px-4 md:px-8 py-4">
        {error && (
          <div className="mx-auto max-w-3xl mb-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm">
            {error}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="mx-auto max-w-3xl flex items-end gap-2 rounded-2xl border border-border bg-card p-2 pl-4 shadow-card focus-within:border-primary transition-colors"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="ask about a movie, a mood, a plot…"
            className="flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground/70 max-h-32"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-all",
              "hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100",
              "shadow-glow",
            )}
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
      className={cn("flex gap-2 items-end", isUser ? "justify-end" : "justify-start")}
    >
      {!isUser && <Mascot size={32} className="shrink-0" />}
      <div className={cn("flex flex-col gap-2 max-w-[85%] md:max-w-[75%]", isUser && "items-end")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-card whitespace-pre-wrap",
            isUser
              ? "bg-primary text-primary-foreground rounded-br-md"
              : "bg-card text-card-foreground rounded-bl-md",
          )}
        >
          {message.text}
        </div>
        {message.sources && message.sources.length > 0 && <SourceRail sources={message.sources} />}
      </div>
    </motion.div>
  );
}

function SourceRail({ sources }: { sources: ChatSource[] }) {
  return (
    <div className="w-full">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5 flex items-center gap-1.5">
        <Ticket className="h-3 w-3" /> sources
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
        {sources.map((s, i) => (
          <TicketStub key={i} source={s} />
        ))}
      </div>
    </div>
  );
}

function TicketStub({ source }: { source: ChatSource }) {
  const pct = Math.round((source.score <= 1 ? source.score * 100 : source.score));
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="ticket-notch snap-start shrink-0 min-w-[180px] max-w-[240px] bg-gradient-to-br from-card to-muted border border-border/60 px-3 py-2.5"
    >
      <div className="text-[9px] uppercase tracking-[0.2em] text-primary font-semibold">admit one</div>
      <div className="text-sm font-medium truncate">{source.title}</div>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary rounded-full"
            style={{ width: `${Math.min(100, Math.max(4, pct))}%` }}
          />
        </div>
        <span className="text-[10px] font-mono text-muted-foreground tabular-nums">{pct}%</span>
      </div>
    </motion.div>
  );
}

function EmptyState({ onPick, disabled }: { onPick: (q: string) => void; disabled: boolean }) {
  return (
    <div className="mx-auto max-w-2xl pt-8 md:pt-16 text-center flex flex-col items-center gap-6">
      <div className="relative">
        <Mascot size={88} />
        <div className="absolute inset-0 -z-10 blur-3xl bg-primary/40 rounded-full" />
      </div>
      <div>
        <h2 className="font-display text-3xl md:text-4xl">what are we watching?</h2>
        <p className="text-muted-foreground mt-2">
          ask CineSquad anything — plots, recs, hot takes, or that one movie with the guy from the thing.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-lg">
        {EXAMPLES.map((q) => (
          <button
            key={q}
            onClick={() => onPick(q)}
            disabled={disabled}
            className="text-left rounded-2xl border border-border bg-card/60 px-4 py-3 text-sm hover:border-primary hover:bg-card hover:-translate-y-0.5 hover:shadow-glow transition-all disabled:opacity-50"
          >
            <span className="text-primary mr-2">›</span>
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
