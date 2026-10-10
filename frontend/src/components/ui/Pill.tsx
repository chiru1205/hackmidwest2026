import type { ReactNode } from "react";
import type { Bucket, ClusterStatus } from "@contracts";

export type PillVariant =
  | "neutral" | "primary" | "outline" | "success" | "hazard"
  | Bucket | ClusterStatus;

export interface PillProps {
  variant?: PillVariant;
  size?: "sm" | "md";
  /** Leading status dot. Pass "pulse" for a live pulsing dot. */
  dot?: boolean | "pulse";
  icon?: ReactNode;
  /** Solid fill instead of soft tint (for the strongest signal on a card). */
  solid?: boolean;
  mono?: boolean;
  title?: string;
  className?: string;
  children?: ReactNode;
}

/** Rounded pill. `variant` accepts P1-P4, reported/assigned/in_progress/fixed, or a plain tone. */
export function Pill({ variant = "neutral", size = "md", dot, icon, solid, mono, title, className = "", children }: PillProps) {
  return (
    <span
      className={`ui-pill ui-pill--${variant} ui-pill--${size} ${solid ? "is-solid" : ""} ${mono ? "is-mono" : ""} ${className}`}
      title={title}
    >
      {dot && <i className={`ui-pill__dot ${dot === "pulse" ? "is-pulse" : ""}`} aria-hidden />}
      {icon}
      {children}
    </span>
  );
}
export const Badge = Pill;

const STATUS_LABEL: Record<ClusterStatus, string> = {
  reported: "Reported", assigned: "Crew assigned", in_progress: "In progress", fixed: "Fixed",
};
export const statusLabel = (s: ClusterStatus) => STATUS_LABEL[s] ?? s;

/** P1-P4 pill. With `score` it appends the numeric priority in mono. */
export function PriorityBadge({ bucket, score, solid, size }: { bucket: Bucket; score?: number; solid?: boolean; size?: "sm" | "md" }) {
  return (
    <Pill variant={bucket} dot solid={solid} size={size} title={score != null ? `Priority ${Math.round(score)} of 100` : undefined}>
      {bucket}
      {score != null && <span className="ui-pill__score">{Math.round(score)}</span>}
    </Pill>
  );
}

export function StatusBadge({ status, size }: { status: ClusterStatus; size?: "sm" | "md" }) {
  return <Pill variant={status} dot={status === "in_progress" ? "pulse" : true} size={size}>{statusLabel(status)}</Pill>;
}

/** Ticket id in mono, e.g. CF-1042. */
/** DevRev display id (e.g. "TKT-9") from the ticket's tags, when the ticket is mirrored to DevRev. */
export function devrevOf(ticket?: { tags?: string[] } | null): string | null {
  const t = ticket?.tags?.find((x) => x.startsWith("devrev:"));
  return t ? t.slice(7) : null;
}

export function TicketId({ id, devrev, className = "" }: { id?: string | null; devrev?: string | null; className?: string }) {
  if (!id) return null;
  return (
    <>
      <span className={`ui-ticketid ${className}`} title="Ticket id">{id}</span>
      {devrev && <span className="ui-ticketid ui-ticketid--devrev" title="Synced with DevRev">DevRev {devrev}</span>}
    </>
  );
}
