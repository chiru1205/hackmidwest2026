import type { ReactNode } from "react";
import { useCountUp } from "./hooks";

/** Animated tabular number. `<AnimatedNumber value={211} />` */
export function AnimatedNumber({ value, decimals = 0, prefix = "", suffix = "", ms = 900, className = "" }: {
  value: number; decimals?: number; prefix?: string; suffix?: string; ms?: number; className?: string;
}) {
  const v = useCountUp(value, ms);
  const text = decimals > 0 ? v.toFixed(decimals) : Math.round(v).toLocaleString("en-US");
  return <span className={`t-num ${className}`}>{prefix}{text}{suffix}</span>;
}

export interface StatProps {
  label: string;
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  icon?: ReactNode;
  /** Colours the value and the small marker: priority/status colours only. */
  tone?: "default" | "primary" | "P1" | "P2" | "P3" | "P4" | "success" | "hazard";
  hint?: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/** Label + big animated number (+ optional hint). Place inside a <Card> or a glass panel. */
export function Stat({ label, value, decimals, prefix, suffix, icon, tone = "default", hint, size = "md", className = "" }: StatProps) {
  return (
    <div className={`ui-stat ui-stat--${size} ui-stat--${tone} ${className}`}>
      <div className="ui-stat__label">{icon}<span>{label}</span></div>
      <AnimatedNumber value={value} decimals={decimals} prefix={prefix} suffix={suffix} className="ui-stat__value" />
      {hint && <div className="ui-stat__hint">{hint}</div>}
    </div>
  );
}
