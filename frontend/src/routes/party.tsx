import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { Users, Ticket, ArrowRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Mascot } from "@/components/Mascot";
import { NotReady, OfflineNotice } from "@/components/NotReady";
import { api, ApiError } from "@/lib/api";
import { useHealth } from "@/hooks/useHealth";
import { useParty } from "@/hooks/useParty";

export const Route = createFileRoute("/party")({
  head: () => ({
    meta: [
      { title: "Watch Party — CineSquad" },
      { name: "description", content: "Get everyone in the group to agree on a movie, for once." },
      { property: "og:title", content: "Watch Party — CineSquad" },
      { property: "og:description", content: "Shared-session group movie recommendations." },
    ],
  }),
  component: PartyPage,
});

function PartyPage() {
  return (
    <AppShell>
      <Party />
    </AppShell>
  );
}

function Party() {
  const { health, online } = useHealth();
  const { identity, setIdentity, clearIdentity } = useParty();
  const navigate = useNavigate();

  const [creatorName, setCreatorName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinName, setJoinName] = useState("");
  const [loading, setLoading] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Once a device already has a saved session, default to just offering to
  // rejoin it -- showing the create/join forms at the same time is what let
  // someone accidentally end up in their own party twice under two names.
  const [startFresh, setStartFresh] = useState(false);

  async function createSession(e: React.FormEvent) {
    e.preventDefault();
    if (!creatorName.trim() || loading) return;
    setLoading("create");
    setError(null);
    try {
      const res = await api.createSession(creatorName.trim());
      setIdentity({ sessionId: res.session_id, userId: res.users[0].user_id, displayName: creatorName.trim() });
      navigate({ to: "/party/$sessionId", params: { sessionId: res.session_id } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "couldn't start a session. try again.");
    } finally {
      setLoading(null);
    }
  }

  async function joinSession(e: React.FormEvent) {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code || !joinName.trim() || loading) return;
    setLoading("join");
    setError(null);
    try {
      const res = await api.joinSession(code, joinName.trim());
      // On a rejoin (same device already has a seat), the backend keeps the
      // original name rather than renaming -- use its response, not the
      // name just typed, so the two stay in sync.
      setIdentity({ sessionId: res.session_id, userId: res.user_id, displayName: res.display_name });
      navigate({ to: "/party/$sessionId", params: { sessionId: res.session_id } });
    } catch (err) {
      if (err instanceof ApiError && err.kind === "not_found") setError("that room code doesn't exist.");
      else if (err instanceof ApiError && err.kind === "bad_request") setError(err.message);
      else setError("couldn't join that session. try again.");
    } finally {
      setLoading(null);
    }
  }

  if (!online) return <Wrap><OfflineNotice /></Wrap>;
  if (!health.group_recommender_ready) return <Wrap><NotReady /></Wrap>;

  return (
    <Wrap>
      <div className="mx-auto max-w-2xl pt-8 md:pt-16 text-center flex flex-col items-center gap-6">
        <div className="relative">
          <Mascot size={88} />
          <div className="absolute inset-0 -z-10 blur-3xl bg-primary/40 rounded-full" />
        </div>
        <div>
          <h1 className="font-display text-3xl md:text-4xl">throw a watch party</h1>
          <p className="text-muted-foreground mt-2">
            everyone answers a few questions, we find something you'll all actually agree on.
          </p>
        </div>

        {error && (
          <div className="w-full max-w-md rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm">
            {error}
          </div>
        )}

        {identity && !startFresh ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md rounded-3xl border border-primary/50 bg-card p-6 shadow-card flex flex-col items-center gap-3"
          >
            <p className="text-sm text-muted-foreground">
              you're already in a party as <span className="text-foreground font-semibold">{identity.displayName}</span>
            </p>
            <button
              onClick={() => navigate({ to: "/party/$sessionId", params: { sessionId: identity.sessionId } })}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold shadow-glow hover:scale-105 active:scale-95 transition-all"
            >
              <ArrowRight className="h-4 w-4" />
              rejoin your session ({identity.sessionId})
            </button>
            <button
              onClick={() => setStartFresh(true)}
              className="text-xs text-muted-foreground hover:text-primary transition"
            >
              start or join a different party instead
            </button>
          </motion.div>
        ) : (
          <>
            {identity && (
              <button
                onClick={() => setStartFresh(false)}
                className="text-xs text-muted-foreground hover:text-primary transition -mb-2"
              >
                ← back to your current session ({identity.sessionId})
              </button>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-xl text-left">
              <form
                onSubmit={createSession}
                className="rounded-3xl border border-border bg-card p-5 shadow-card flex flex-col gap-3"
              >
                <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
                  <Users className="h-3.5 w-3.5 text-primary" />
                  start a party
                </div>
                <input
                  value={creatorName}
                  onChange={(e) => setCreatorName(e.target.value)}
                  placeholder="your name"
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
                />
                <button
                  type="submit"
                  disabled={loading !== null || !creatorName.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold shadow-glow hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:hover:scale-100"
                >
                  {loading === "create" ? "starting…" : "start a watch party"}
                </button>
              </form>

              <form
                onSubmit={joinSession}
                className="rounded-3xl border border-border bg-card p-5 shadow-card flex flex-col gap-3"
              >
                <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
                  <Ticket className="h-3.5 w-3.5 text-primary" />
                  join with a code
                </div>
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="room code"
                  maxLength={6}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-mono tracking-[0.2em] uppercase outline-none focus:border-primary transition-colors"
                />
                <input
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  placeholder="your name"
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
                />
                <button
                  type="submit"
                  disabled={loading !== null || !joinCode.trim() || !joinName.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-secondary text-secondary-foreground px-4 py-2.5 text-sm font-semibold hover:bg-secondary/80 transition-all disabled:opacity-40"
                >
                  {loading === "join" ? "joining…" : "join the party"}
                </button>
              </form>
            </div>

            {identity && (
              <button
                onClick={clearIdentity}
                className="text-xs text-muted-foreground hover:text-destructive transition"
              >
                forget my saved session
              </button>
            )}
          </>
        )}
      </div>
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="px-5 md:px-10 py-8 md:py-12">{children}</div>;
}
