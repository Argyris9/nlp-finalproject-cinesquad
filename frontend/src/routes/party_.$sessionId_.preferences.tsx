import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { X, Wand2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { NotReady, OfflineNotice } from "@/components/NotReady";
import { api, ApiError, type AttentionLevel, type RuntimePreference } from "@/lib/api";
import { useHealth } from "@/hooks/useHealth";
import { useParty } from "@/hooks/useParty";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/party_/$sessionId_/preferences")({
  component: PreferencesPage,
});

const ATTENTION_OPTIONS: { value: AttentionLevel; label: string }[] = [
  { value: "easy", label: "easy watch" },
  { value: "moderate", label: "moderate attention" },
  { value: "complex", label: "complex, thought-provoking" },
];

const RUNTIME_OPTIONS: { value: RuntimePreference; label: string }[] = [
  { value: "under_90", label: "under 90 min" },
  { value: "90_120", label: "90-120 min" },
  { value: "120_150", label: "120-150 min" },
  { value: "any", label: "no preference" },
];

function PreferencesPage() {
  return (
    <AppShell>
      <Preferences />
    </AppShell>
  );
}

function Preferences() {
  const { sessionId } = Route.useParams();
  const { health, online } = useHealth();
  const { identity } = useParty();
  const navigate = useNavigate();

  const [preferredGenres, setPreferredGenres] = useState<string[]>([]);
  const [avoidGenres, setAvoidGenres] = useState<string[]>([]);
  const [moodInput, setMoodInput] = useState("");
  const [moods, setMoods] = useState<string[]>([]);
  const [attentionLevel, setAttentionLevel] = useState<AttentionLevel>("moderate");
  const [runtimePreference, setRuntimePreference] = useState<RuntimePreference>("any");
  const [minRating, setMinRating] = useState(0);
  const [freeText, setFreeText] = useState("");
  const [referenceMovies, setReferenceMovies] = useState<string[]>(["", "", ""]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleGenre(list: string[], setList: (v: string[]) => void, genre: string) {
    setList(list.includes(genre) ? list.filter((g) => g !== genre) : [...list, genre]);
  }

  function addMood() {
    const m = moodInput.trim().toLowerCase();
    if (m && !moods.includes(m)) setMoods([...moods, m]);
    setMoodInput("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!identity || identity.sessionId !== sessionId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.submitPreferences(sessionId, {
        user_id: identity.userId,
        preferred_genres: preferredGenres,
        avoid_genres: avoidGenres,
        moods,
        attention_level: attentionLevel,
        runtime_preference: runtimePreference,
        min_rating: minRating,
        free_text: freeText,
        reference_movies: referenceMovies.map((m) => m.trim()).filter(Boolean),
      });
      navigate({ to: "/party/$sessionId", params: { sessionId } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "couldn't save your preferences. try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!online) return <Wrap><OfflineNotice /></Wrap>;
  if (!health.group_recommender_ready) return <Wrap><NotReady /></Wrap>;
  if (!identity || identity.sessionId !== sessionId) {
    return (
      <Wrap>
        <NotReady title="join the party first" subtitle="head back to the room and join before setting your preferences." />
      </Wrap>
    );
  }

  return (
    <Wrap>
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 text-center">
          <h1 className="font-display text-3xl md:text-4xl">what are you in the mood for?</h1>
          <p className="text-muted-foreground mt-2">be honest, {identity.displayName} — the group's counting on you.</p>
        </header>

        <form onSubmit={submit} className="rounded-3xl border border-border bg-card p-5 md:p-6 shadow-card flex flex-col gap-6">
          <Field label="genres you're into">
            <ChipRow options={api.genres} selected={preferredGenres} onToggle={(g) => toggleGenre(preferredGenres, setPreferredGenres, g)} />
          </Field>

          <Field label="genres to avoid">
            <ChipRow
              options={api.genres}
              selected={avoidGenres}
              onToggle={(g) => toggleGenre(avoidGenres, setAvoidGenres, g)}
              variant="avoid"
            />
          </Field>

          <Field label="mood / vibe">
            <div className="flex flex-wrap gap-2 mb-2">
              {moods.map((m) => (
                <span key={m} className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary px-3 py-1 text-xs">
                  {m}
                  <button type="button" onClick={() => setMoods(moods.filter((x) => x !== m))}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <input
              value={moodInput}
              onChange={(e) => setMoodInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addMood();
                }
              }}
              onBlur={addMood}
              placeholder="type a mood and hit enter (e.g. dark, cozy, thought-provoking)"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
            />
          </Field>

          <Field label="how much attention do you want to give it?">
            <div className="flex flex-wrap gap-2">
              {ATTENTION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAttentionLevel(opt.value)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm transition-all",
                    attentionLevel === opt.value
                      ? "bg-primary text-primary-foreground border-primary shadow-glow"
                      : "border-border hover:border-primary/50",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="runtime">
            <div className="flex flex-wrap gap-2">
              {RUNTIME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRuntimePreference(opt.value)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm transition-all",
                    runtimePreference === opt.value
                      ? "bg-primary text-primary-foreground border-primary shadow-glow"
                      : "border-border hover:border-primary/50",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label={`minimum rating: ${minRating.toFixed(1)} / 5`}>
            <input
              type="range"
              min={0}
              max={5}
              step={0.5}
              value={minRating}
              onChange={(e) => setMinRating(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </Field>

          <Field label="describe what you want to watch tonight">
            <textarea
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              rows={3}
              placeholder="something clever and a little dark, but not full horror…"
              className="w-full resize-none rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary transition-colors"
            />
          </Field>

          <Field label="name 1-3 movies you liked (optional)">
            <div className="flex flex-col gap-2">
              {referenceMovies.map((m, i) => (
                <input
                  key={i}
                  value={m}
                  onChange={(e) => {
                    const next = [...referenceMovies];
                    next[i] = e.target.value;
                    setReferenceMovies(next);
                  }}
                  placeholder={`movie ${i + 1}`}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
                />
              ))}
            </div>
          </Field>

          {error && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm">{error}</div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-3 text-sm font-semibold shadow-glow hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:hover:scale-100"
          >
            <Wand2 className="h-4 w-4" />
            {submitting ? "saving…" : "i'm ready"}
          </button>
        </form>
      </div>
    </Wrap>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

function ChipRow({
  options,
  selected,
  onToggle,
  variant = "prefer",
}: {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  variant?: "prefer" | "avoid";
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
              active
                ? variant === "avoid"
                  ? "bg-destructive/20 text-destructive border-destructive/50"
                  : "bg-primary text-primary-foreground border-primary shadow-glow"
                : "border-border text-foreground/70 hover:border-primary/50",
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="px-5 md:px-10 py-8 md:py-12">{children}</div>;
}
