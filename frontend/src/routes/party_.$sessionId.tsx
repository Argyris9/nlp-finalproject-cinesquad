import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Check, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { NotReady, OfflineNotice } from "@/components/NotReady";
import { api, ApiError, type SessionStatusResponse } from "@/lib/api";
import { useHealth } from "@/hooks/useHealth";
import { useParty } from "@/hooks/useParty";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/party_/$sessionId")({
  component: WaitingRoomPage,
});

const WAITING_CAPTIONS = [
  "waiting on the rest of the squad…",
  "someone's still deciding between horror and rom-com…",
  "popcorn's popping, people are pondering…",
  "hang tight, almost everyone's in…",
];

function WaitingRoomPage() {
  return (
    <AppShell>
      <WaitingRoom />
    </AppShell>
  );
}

function WaitingRoom() {
  const { sessionId } = Route.useParams();
  const { health, online } = useHealth();
  const { identity, setIdentity } = useParty();
  const navigate = useNavigate();

  const [status, setStatus] = useState<SessionStatusResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [captionIdx, setCaptionIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [joinName, setJoinName] = useState("");
  const [joining, setJoining] = useState(false);

  const belongsHere = identity?.sessionId === sessionId;

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const s = await api.sessionStatus(sessionId);
        if (!cancelled) {
          setStatus(s);
          setNotFound(false);
        }
      } catch (err) {
        if (!cancelled && err instanceof ApiError && err.kind === "not_found") setNotFound(true);
      }
    }
    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId]);

  useEffect(() => {
    const interval = setInterval(() => setCaptionIdx((i) => (i + 1) % WAITING_CAPTIONS.length), 4000);
    return () => clearInterval(interval);
  }, []);

  async function joinThisSession(e: React.FormEvent) {
    e.preventDefault();
    if (!joinName.trim() || joining) return;
    setJoining(true);
    setError(null);
    try {
      const res = await api.joinSession(sessionId, joinName.trim());
      // On a rejoin (same device already has a seat), the backend keeps the
      // original name -- use its response, not the name just typed.
      setIdentity({ sessionId: res.session_id, userId: res.user_id, displayName: res.display_name });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "couldn't join. try again.");
    } finally {
      setJoining(false);
    }
  }

  function getRecommendations() {
    // The results page itself calls POST /recommend and owns that loading
    // state -- avoids computing recommendations twice (once here, once there).
    navigate({ to: "/party/$sessionId/results", params: { sessionId } });
  }

  function copyCode() {
    navigator.clipboard.writeText(sessionId).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!online) return <Wrap><OfflineNotice /></Wrap>;
  if (!health.group_recommender_ready) return <Wrap><NotReady /></Wrap>;
  if (notFound) {
    return (
      <Wrap>
        <NotReady title="that room code doesn't exist" subtitle="double check it, or start a new watch party." />
      </Wrap>
    );
  }
  if (!status) return <Wrap><div className="text-sm text-muted-foreground">loading…</div></Wrap>;

  const me = belongsHere ? status.users.find((u) => u.user_id === identity!.userId) : undefined;

  return (
    <Wrap>
      <div className="mx-auto max-w-2xl flex flex-col items-center gap-6 text-center">
        <div>
          <h1 className="font-display text-3xl md:text-4xl">movie night HQ</h1>
          <p className="text-muted-foreground mt-2">get the whole squad in before we pick something.</p>
        </div>

        <button
          onClick={copyCode}
          className="ticket-notch bg-gradient-to-br from-card to-muted border border-border/60 px-8 py-4 flex flex-col items-center gap-1 hover:-translate-y-0.5 transition-transform"
        >
          <span className="text-[10px] uppercase tracking-[0.3em] text-primary font-semibold">room code</span>
          <span className="font-mono text-3xl tracking-[0.3em]">{sessionId}</span>
          <span className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "copied!" : "tap to copy"}
          </span>
        </button>

        {!belongsHere && (
          <form onSubmit={joinThisSession} className="w-full max-w-sm rounded-3xl border border-border bg-card p-4 shadow-card flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">you're viewing this room but haven't joined yet.</p>
            <input
              value={joinName}
              onChange={(e) => setJoinName(e.target.value)}
              placeholder="your name"
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
            />
            <button
              type="submit"
              disabled={joining || !joinName.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold shadow-glow hover:scale-105 active:scale-95 transition-all disabled:opacity-40"
            >
              {joining ? "joining…" : "join this party"}
            </button>
          </form>
        )}

        <div className="w-full max-w-sm flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {status.users.map((u) => (
              <motion.div
                key={u.user_id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between rounded-xl border border-border bg-card/60 px-4 py-2.5"
              >
                <span className={cn("text-sm", u.user_id === identity?.userId && "font-semibold text-primary")}>
                  {u.display_name}
                  {u.user_id === identity?.userId && " (you)"}
                </span>
                <span
                  className={cn(
                    "h-2.5 w-2.5 rounded-full",
                    u.ready ? "bg-success shadow-[0_0_8px_currentColor]" : "bg-muted-foreground/40",
                  )}
                  title={u.ready ? "ready" : "still deciding"}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {error && (
          <div className="w-full max-w-sm rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm">
            {error}
          </div>
        )}

        {belongsHere && !me?.ready && (
          <button
            onClick={() => navigate({ to: "/party/$sessionId/preferences", params: { sessionId } })}
            className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold shadow-glow hover:scale-105 active:scale-95 transition-all"
          >
            fill out your preferences
          </button>
        )}

        {belongsHere && me?.ready && !status.all_users_ready && (
          <p className="text-sm text-muted-foreground">
            <AnimatePresence mode="wait">
              <motion.span key={captionIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {WAITING_CAPTIONS[captionIdx]}
              </motion.span>
            </AnimatePresence>
          </p>
        )}

        <button
          onClick={getRecommendations}
          disabled={!status.all_users_ready}
          className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-6 py-3 text-sm font-semibold shadow-glow hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:hover:scale-100"
        >
          <Sparkles className="h-4 w-4" />
          get recommendations
        </button>
        {!status.min_users_reached && (
          <p className="text-xs text-muted-foreground">need at least 2 people in the room to get started.</p>
        )}
      </div>
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="px-5 md:px-10 py-8 md:py-12">{children}</div>;
}
