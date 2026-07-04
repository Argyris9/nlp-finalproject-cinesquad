import { Link, useRouterState } from "@tanstack/react-router";
import { MessageCircle, Wand2, Smile, Compass, Users, Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { useHealth } from "@/hooks/useHealth";
import { Mascot } from "@/components/Mascot";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const NAV = [
  { to: "/", label: "Chat", icon: MessageCircle, flag: "rag_ready" as const },
  { to: "/genre", label: "Genre Guesser", icon: Wand2, flag: "classification_ready" as const },
  { to: "/vibe", label: "Vibe Check", icon: Smile, flag: "sentiment_ready" as const },
  { to: "/topics", label: "Explore Topics", icon: Compass, flag: "topic_modeling_ready" as const },
  { to: "/party", label: "Watch Party", icon: Users, flag: "group_recommender_ready" as const },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { theme, toggle } = useTheme();
  const { health, online } = useHealth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Sidebar (desktop) / topbar (mobile) */}
      <aside className="md:w-64 md:min-h-screen border-b md:border-b-0 md:border-r border-border bg-card/40 backdrop-blur-xl md:sticky md:top-0 md:h-screen flex md:flex-col">
        <div className="flex items-center justify-between md:justify-start md:flex-col md:items-stretch gap-3 px-5 py-4 md:py-6 w-full">
          <Link to="/" className="flex items-center gap-3 group">
            <Mascot size={40} className="drop-shadow-[0_0_12px_var(--color-primary)]" />
            <div className="leading-tight">
              <div className="font-display text-xl tracking-tight">CineSquad</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                movie night HQ
              </div>
            </div>
          </Link>
          <button
            onClick={toggle}
            className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-full border border-border hover:bg-accent transition"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>

        <nav className="hidden md:flex flex-col gap-1 px-3">
          {NAV.map((item) => {
            const active = pathname === item.to;
            const ready = health[item.flag];
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all",
                  active
                    ? "bg-primary text-primary-foreground shadow-glow"
                    : "text-foreground/80 hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 font-medium">{item.label}</span>
                <StatusDot ready={ready && online} />
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:block mt-auto px-5 py-4 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className={cn("h-2 w-2 rounded-full", online ? "bg-success" : "bg-muted-foreground/50")} />
            {online ? "backend online" : "backend offline"}
          </div>
          <button
            onClick={toggle}
            className="mt-3 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 hover:bg-accent transition"
          >
            {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            {theme === "dark" ? "lights on" : "lights off"}
          </button>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-border bg-card/90 backdrop-blur-xl">
        <div className="grid grid-cols-5">
          {NAV.map((item) => {
            const active = pathname === item.to;
            const ready = health[item.flag];
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium transition-colors relative",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <div className="relative">
                  <Icon className="h-5 w-5" />
                  <span
                    className={cn(
                      "absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full",
                      ready && online ? "bg-success" : "bg-muted-foreground/50",
                    )}
                  />
                </div>
                <span>{item.label.split(" ")[0]}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <main className="flex-1 pb-20 md:pb-0 min-w-0">{children}</main>
    </div>
  );
}

function StatusDot({ ready }: { ready: boolean }) {
  return (
    <span
      className={cn(
        "h-2 w-2 rounded-full transition-colors",
        ready ? "bg-success shadow-[0_0_8px_currentColor]" : "bg-muted-foreground/40",
      )}
      title={ready ? "ready" : "not ready"}
    />
  );
}
