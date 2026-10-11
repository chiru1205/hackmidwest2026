import type { Cluster, ClusterStatus, TicketStage, VendorOrder } from "@contracts";
import { catLabel } from "../lib/const";

const SUFFIX = "Ave|St|Rd|Blvd|Ter|Dr|Ln|Pl|Ct|Way|Pkwy|Cir|Hwy|Trfy|Trl|Sq";

/** Raw 311 addresses carry city, zip and stray ALL-CAPS notes. Keep just the street. */
export function cleanAddress(raw?: string | null, fallback = "Unknown location"): string {
  if (!raw) return fallback;
  let s = raw.replace(/\s+Kansas City.*$/i, "").replace(/\s+\d{5}(-\d{4})?$/, "").trim();
  const m = s.match(new RegExp(`^(.*?\\b(?:${SUFFIX}))\\.?\\s+[A-Z]{3,}.*$`));
  if (m) s = m[1];
  return s || fallback;
}

export const placeOf = (c: Cluster) => cleanAddress(c.address, c.neighborhood ?? "Unknown location");
export const titleOf = (c: Cluster) => `${catLabel(c.category)} – ${placeOf(c)}`;

export type Stage = "queued" | "in_progress" | "awaiting_verification" | "resolved";
export const STAGE_LABEL: Record<Stage, string> = { queued: "Queued", in_progress: "In progress", awaiting_verification: "Awaiting verification", resolved: "Resolved" };

/** A work order plus the one thing the server list does not say: the crew submitted the repair and the city has not confirmed it. */
export type OrderView = VendorOrder & { awaiting?: boolean };

export function stageOf(o: OrderView): Stage {
  if (o.cluster.status === "fixed" || o.ticket?.stage === "resolved") return "resolved";
  if (o.awaiting || o.ticket?.tags?.includes("awaiting_verification")) return "awaiting_verification";
  if (o.cluster.status === "in_progress" || o.ticket?.stage === "work_in_progress") return "in_progress";
  return "queued";
}

const DAY = 86_400_000;
export type DueTone = "overdue" | "soon" | "ok" | "done";
export interface DueInfo { text: string; short: string; tone: DueTone }

export function dueInfo(due: string, done: boolean, now = Date.now()): DueInfo {
  const d = new Date(due);
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (done) return { text: "Completed", short: "Done", tone: "done" };
  const diff = d.getTime() - now;
  const days = Math.ceil(Math.abs(diff) / DAY);
  if (diff < 0) {
    const hrs = Math.floor(-diff / 3_600_000);
    const t = hrs < 24 ? `${Math.max(1, hrs)}h` : `${Math.floor(-diff / DAY)}d`;
    return { text: `Overdue by ${t}`, short: `Overdue ${t}`, tone: "overdue" };
  }
  if (diff < DAY) return { text: "Due today", short: "Due today", tone: "soon" };
  if (days <= 2) return { text: `Due in ${days} days (${date})`, short: `Due in ${days}d`, tone: "soon" };
  return { text: `Due in ${days} days (${date})`, short: `Due ${date}`, tone: "ok" };
}

/** Awaiting verification is the city's move, so it never counts against the crew's due date. */
export const isOverdue = (o: OrderView, now = Date.now()) => { const s = stageOf(o); return s !== "resolved" && s !== "awaiting_verification" && new Date(o.due).getTime() < now; };

/** Due-date info for a row or header: finished work shows Completed, submitted work shows Submitted. */
export function dueFor(o: OrderView, now = Date.now()): DueInfo {
  const s = stageOf(o);
  if (s === "awaiting_verification") return { text: "Submitted for verification", short: "Submitted", tone: "done" };
  return dueInfo(o.due, s === "resolved", now);
}

export function fmtDate(iso?: string | null, withTime = true): string {
  if (!iso) return "-";
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return withTime ? `${date}, ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : date;
}

export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const SEVERITY_LABEL: Record<string, string> = { blocker: "Blocker", high: "High", medium: "Medium", low: "Low" };

export interface Override { status: ClusterStatus; stage: TicketStage; afterUrl?: string; fixedAt?: string; snapshot?: VendorOrder; awaiting?: boolean }

/* The browser also remembers what the crew submitted (per viewer, a few hours) so the row flips at once, before the list reloads. */
const AWAIT_KEY = "cf.vendor.awaiting";
const AWAIT_TTL_MS = 6 * 3_600_000;
const readAwaiting = (): Record<string, number> => {
  try { return JSON.parse(localStorage.getItem(AWAIT_KEY) || "{}") as Record<string, number>; } catch { return {}; }
};
export function rememberAwaiting(id: string, on: boolean) {
  try {
    const m = readAwaiting();
    if (on) m[id] = Date.now(); else delete m[id];
    localStorage.setItem(AWAIT_KEY, JSON.stringify(m));
  } catch { /* storage can be blocked; the optimistic state still works for this visit */ }
}
export function loadAwaiting(now = Date.now()): Record<string, Override> {
  const out: Record<string, Override> = {};
  for (const [id, ts] of Object.entries(readAwaiting())) {
    if (now - ts < AWAIT_TTL_MS) out[id] = { status: "in_progress", stage: "work_in_progress", awaiting: true };
  }
  return out;
}

export function applyOverride(o: VendorOrder, ov?: Override): OrderView {
  if (!ov) return o;
  return {
    ...o,
    awaiting: ov.awaiting || undefined,
    cluster: { ...o.cluster, status: ov.status, fixed_at: ov.fixedAt ?? o.cluster.fixed_at },
    ticket: o.ticket ? { ...o.ticket, stage: ov.stage } : o.ticket,
  };
}
