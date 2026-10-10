import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { spring } from "./motion";

type Tone = "primary" | "success" | "hazard" | "P1" | "P2" | "P3" | "P4";
const toneVar = (t: Tone) => (t === "primary" ? "var(--primary)" : t === "success" ? "var(--success)" : t === "hazard" ? "var(--hazard)" : `var(--${t.toLowerCase()})`);

/** Spring-animated horizontal bar. value 0..100 (or value/max). */
export function ProgressBar({ value, max = 100, tone = "primary", height = 8, label, className = "" }: {
  value: number; max?: number; tone?: Tone; height?: number; label?: string; className?: string;
}) {
  const pct = Math.max(0, Math.min(1, max ? value / max : 0));
  return (
    <div
      className={`ui-bar ${className}`}
      style={{ height }}
      role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)} aria-label={label}
    >
      <motion.i
        className="ui-bar__fill"
        style={{ background: toneVar(tone) }}
        initial={{ width: "0%" }}
        animate={{ width: `${Math.max(pct * 100, pct > 0 ? 3 : 0)}%` }}
        transition={spring.soft}
      />
    </div>
  );
}

/** Circular progress with centered children (level, XP...). */
export function ProgressRing({ value, max = 100, size = 120, stroke = 10, tone = "primary", label, children }: {
  value: number; max?: number; size?: number; stroke?: number; tone?: Tone; label?: string; children?: ReactNode;
}) {
  const pct = Math.max(0, Math.min(1, max ? value / max : 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="ui-ring" style={{ width: size, height: size }} role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)} aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={toneVar(tone)} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={spring.slow}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ui-ring__center">{children}</div>
    </div>
  );
}
