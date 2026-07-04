import { motion } from "framer-motion";
import { Clapperboard } from "lucide-react";

const captions = [
  "rewinding the tape…",
  "checking the script…",
  "buttering the popcorn…",
  "cueing the projector…",
  "consulting the film canon…",
  "polling the critics…",
];

export function TypingIndicator() {
  const caption = captions[Math.floor((Date.now() / 2500) % captions.length)];
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-card/80 px-4 py-3 shadow-card animate-bubble-in max-w-[80%]">
      <Clapperboard className="h-4 w-4 text-primary animate-reel-spin" />
      <div className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="inline-block h-2 w-2 rounded-full bg-primary"
            style={{ animation: `bounce-dot 1.2s ${i * 0.15}s infinite ease-in-out` }}
          />
        ))}
      </div>
      <motion.span
        key={caption}
        className="text-xs text-muted-foreground italic"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {caption}
      </motion.span>
    </div>
  );
}
