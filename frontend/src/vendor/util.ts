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

export type Stage = "queued" | "in_progress" | "resolved";
export const STAGE_LABEL: Record<Stage, string> = { queued: "Queued", in_progress: "In progress", resolved: "Resolved" };

export function stageOf(o: VendorOrder): Stage {
  if (o.cluster.status === "fixed" || o.ticket?.stage === "resolved") return "resolved";
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

export const isOverdue = (o: VendorOrder, now = Date.now()) => stageOf(o) !== "resolved" && new Date(o.due).getTime() < now;

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

export interface Override { status: ClusterStatus; stage: TicketStage; afterUrl?: string; fixedAt?: string; snapshot?: VendorOrder }

export function applyOverride(o: VendorOrder, ov?: Override): VendorOrder {
  if (!ov) return o;
  return {
    ...o,
    cluster: { ...o.cluster, status: ov.status, fixed_at: ov.fixedAt ?? o.cluster.fixed_at },
    ticket: o.ticket ? { ...o.ticket, stage: ov.stage } : o.ticket,
  };
}
