import type { ImpactFact } from "@contracts";

export const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/** 38 s, 4 min, 2.5 h. */
export function fmtDuration(s: number): string {
  if (s < 90) return `${Math.max(1, Math.round(s))} s`;
  if (s < 90 * 60) return `${Math.round(s / 60)} min`;
  const h = s / 3600;
  return `${h < 10 ? Math.round(h * 10) / 10 : Math.round(h)} h`;
}

/** 840 ms, 1.4 s. */
export function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

export const nums = (s: string): number[] => (s.replace(/,/g, "").match(/\d+(?:\.\d+)?/g) ?? []).map(Number);

/** First fact whose label matches every needle (case-insensitive), or undefined. */
export function findFact(facts: ImpactFact[], ...needles: RegExp[]): ImpactFact | undefined {
  return facts.find((f) => needles.every((n) => n.test(f.label)));
}

/** "about 28%" -> 28; null when the value holds no number. */
export function pct(f?: ImpactFact): number | null {
  const n = f ? nums(f.value)[0] : undefined;
  return n == null || !Number.isFinite(n) ? null : Math.max(0, Math.min(100, n));
}
