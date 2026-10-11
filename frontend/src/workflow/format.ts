import type { CaseRow } from "../lib/api";

type Row = Pick<CaseRow, "stage_key" | "priority_bucket" | "due" | "overdue" | "escalated" | "reporters" | "vendor">;

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** Compact duration: 45s, 12m, 5h, 3d. */
export function shortDur(s: number): string {
  s = Math.max(0, Math.round(s));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}
/** Spoken duration: 12 minutes, 5 hours, 3 days. */
export function longDur(s: number): string {
  s = Math.max(0, Math.round(s));
  if (s < 60) return plural(s, "second");
  if (s < 3600) return plural(Math.round(s / 60), "minute");
  if (s < 86400) return plural(Math.round(s / 3600), "hour");
  return plural(Math.round(s / 86400), "day");
}
export function relTime(iso: string | null | undefined, now: number): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (isNaN(t)) return "";
  const d = Math.max(0, (now - t) / 1000);
  return d < 10 ? "just now" : `${longDur(d)} ago`;
}

/** Seconds past the due time (positive = overdue), or null without a deadline. */
export function overdueBy(t: Pick<Row, "due">, now: number): number | null {
  const d = t.due ? Date.parse(t.due) : NaN;
  return isNaN(d) ? null : (now - d) / 1000;
}

/** Short rail line: "P1 · overdue 1d", "P2 · 4h left", "P3 · escalated". */
export function railMeta(t: Row, now: number): string {
  const parts: string[] = [t.priority_bucket];
  if (t.stage_key === "resolved") return `${t.priority_bucket} · resolved`;  // no countdown or crew nag on a closed case
  const late = overdueBy(t, now);
  if (t.overdue) parts.push(late != null && late > 0 ? `overdue ${shortDur(late)}` : "overdue");
  else if (late != null && late < 0) parts.push(`${shortDur(-late)} left`);
  if (t.escalated) parts.push("escalated");
  if (!t.vendor) parts.push("no crew");
  else if (parts.length < 3 && t.reporters > 1) parts.push(`${t.reporters.toLocaleString()} reporters`);
  return parts.join(" · ");
}

/** Strip the "[P1] " prefix the ticket title carries. */
export const cleanTitle = (title: string) => title.replace(/^\[P\d\]\s*/i, "");

export const PRIORITY_WORD: Record<string, string> = { P1: "urgent", P2: "high", P3: "normal", P4: "low" };
