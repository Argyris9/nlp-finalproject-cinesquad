import { motion } from "framer-motion";

export function Mascot({ className, size = 40 }: { className?: string; size?: number }) {
  return (
    <motion.svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      initial={{ rotate: -6 }}
      animate={{ rotate: [-6, 6, -6] }}
      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      aria-hidden
    >
      <defs>
        <radialGradient id="reel" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="oklch(0.35 0.02 285)" />
          <stop offset="100%" stopColor="oklch(0.18 0.02 285)" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="28" fill="url(#reel)" stroke="var(--color-primary)" strokeWidth="2" />
      <circle cx="32" cy="32" r="5" fill="var(--color-primary)" />
      <g fill="var(--color-primary)" opacity="0.85">
        <circle cx="32" cy="14" r="4" />
        <circle cx="32" cy="50" r="4" />
        <circle cx="14" cy="32" r="4" />
        <circle cx="50" cy="32" r="4" />
        <circle cx="20" cy="20" r="3" />
        <circle cx="44" cy="44" r="3" />
        <circle cx="20" cy="44" r="3" />
        <circle cx="44" cy="20" r="3" />
      </g>
      {/* eyes */}
      <circle cx="26" cy="30" r="1.6" fill="oklch(0.98 0 0)" />
      <circle cx="38" cy="30" r="1.6" fill="oklch(0.98 0 0)" />
      {/* smile */}
      <path d="M25 37 Q32 42 39 37" stroke="oklch(0.98 0 0)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </motion.svg>
  );
}
