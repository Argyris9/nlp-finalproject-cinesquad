import { Clapperboard } from "lucide-react";
import { motion } from "framer-motion";

export function NotReady({
  title = "still training! check back soon",
  subtitle = "our teammate is teaching this model new tricks — it'll light up here the moment it's ready.",
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-3xl border border-dashed border-border bg-card/40 px-8 py-12 text-center"
    >
      <div className="relative">
        <Clapperboard className="h-14 w-14 text-primary animate-reel-spin" />
        <span className="absolute -right-2 -top-1 text-2xl">🎬</span>
      </div>
      <h3 className="text-2xl font-display">{title}</h3>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </motion.div>
  );
}

export function OfflineNotice() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-3xl border border-destructive/40 bg-destructive/10 px-6 py-8 text-center">
      <span className="text-3xl">📼</span>
      <h3 className="text-xl font-display">the projector's unplugged</h3>
      <p className="text-sm text-muted-foreground">
        can't reach the CineSquad backend. make sure your FastAPI server is running at the configured
        URL — it'll reconnect automatically.
      </p>
    </div>
  );
}
