import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ExternalLink, Flame, Timer, Workflow } from "lucide-react";
import { Button, EmptyState, Pill, PriorityBadge, Sheet } from "../components/ui";
import { authHeaders } from "../lib/auth";
import "./devrev.css";

/* ---- contract types (GET /api/devrev/board, /events) ---- */
export type StageKey = "queued" | "assigned" | "in_progress" | "awaiting_verification" | "resolved";
export interface BoardTicket {
  id: string; devrev_id: string | null; title: string; cluster_id: string; stage_key: StageKey;
  severity: string; priority_bucket: "P1" | "P2" | "P3" | "P4"; vendor: string | null; owner: string | null;
  neighborhood: string | null; district: string | null; zones: string[]; reporters: number; age_s: number;
  due: string | null; overdue: boolean; escalated: boolean; evidence_count: number; web_url: string | null;
}
export interface Board {
  source: string; as_of: string;
  stages: { key: StageKey; label: string; count: number; avg_age_s: number | null; tickets: BoardTicket[] }[];
  totals: { open: number; overdue: number; escalated: number; resolved: number; median_ttr: string | null };
}
export interface DevRevEvent {
  ts: string; kind: string; ticket_id: string; devrev_id: string | null; text: string; source: "DevRev" | "Civic Flow";
}

export const STAGE_LABEL: Record<StageKey, string> = {
  queued: "Queued", assigned: "Assigned", in_progress: "In progress", awaiting_verification: "Awaiting verification", resolved: "Resolved",
};

/** Plain GET that resolves null on any failure (endpoint missing, restart, offline): the UI then shows nothing. */
async function getJson<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(path, { headers: authHeaders() });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch { return null; }
}

function usePoll<T>(path: string, ms: number) {
  const [data, setData] = useState<T | null>(null);
  const alive = useRef(true);
  const fails = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const run = useCallback(() => {
    clearTimeout(timer.current);
    void getJson<T>(path).then((d) => {
      if (!alive.current) return;
      if (d) { fails.current = 0; setData(d); } else fails.current += 1;
      // back off while the endpoint is missing or erroring (30 s after a few misses)
      timer.current = setTimeout(run, fails.current >= 3 ? 30000 : ms);
    });
  }, [path, ms]);
  useEffect(() => {
    alive.current = true;
    run();
    return () => { alive.current = false; clearTimeout(timer.current); };
  }, [run]);
  return { data, refresh: run };
}

export interface DevRevState {
  board: Board | null; byCluster: Map<string, BoardTicket>; events: DevRevEvent[]; refresh: () => void;
}
/** Shared poller: board and events every 5 s. Call `refresh` on SSE ticket events. */
export function useDevRev(): DevRevState {
  const b = usePoll<Board>("/api/devrev/board", 5000);
  const e = usePoll<DevRevEvent[]>("/api/devrev/events?limit=30", 5000);
  const byCluster = useMemo(() => {
    const m = new Map<string, BoardTicket>();
    b.data?.stages?.forEach((s) => s.tickets?.forEach((t) => m.set(t.cluster_id, t)));
    return m;
  }, [b.data]);
  const refreshB = b.refresh, refreshE = e.refresh;
  const refresh = useCallback(() => { refreshB(); refreshE(); }, [refreshB, refreshE]);
  return { board: b.data, byCluster, events: Array.isArray(e.data) ? e.data : [], refresh };
}

export const DevRevCtx = createContext<Map<string, BoardTicket>>(new Map());
export const useDevRevTicket = (clusterId: string) => useContext(DevRevCtx).get(clusterId) ?? null;

export function fmtAge(s: number | null | undefined): string {
  if (s == null || !isFinite(s)) return "n/a";
  if (s < 90) return `${Math.max(1, Math.round(s))}s`;
  if (s < 5400) return `${Math.round(s / 60)}m`;
  if (s < 172800) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

/** Chip: "TKT-21 - In progress" plus small Overdue / Escalated badges. Opens DevRev when `link` and web_url exist. */
export function DevRevChip({ t, link = false, badges = true }: { t: BoardTicket | null; link?: boolean; badges?: boolean }) {
  if (!t || !t.devrev_id) return null;
  const label = `${t.devrev_id} - ${STAGE_LABEL[t.stage_key] ?? t.stage_key}`;
  const inner = <><span className="dr-chip__mark" aria-hidden />{label}{link && t.web_url && <ExternalLink size={11} strokeWidth={2} aria-hidden />}</>;
  return (
    <span className="dr-chips">
      {link && t.web_url ? (
        <a className={`dr-chip is-${t.stage_key} is-link`} href={t.web_url} target="_blank" rel="noreferrer" title="Open in DevRev" onClick={(e) => e.stopPropagation()}>{inner}</a>
      ) : (
        <span className={`dr-chip is-${t.stage_key}`} title="Synced with DevRev">{inner}</span>
      )}
      {badges && t.overdue && <span className="dr-badge is-overdue">Overdue</span>}
      {badges && t.escalated && <span className="dr-badge is-esc">Escalated</span>}
    </span>
  );
}

/* ---------------- Work orders slide-over ---------------- */
function Tile({ v, l, tone }: { v: string | number; l: string; tone?: string }) {
  return <div className={`dr-tile ${tone ? `is-${tone}` : ""}`}><b>{v}</b><span>{l}</span></div>;
}

function Row({ t, onPick, note }: { t: BoardTicket; onPick: (clusterId: string) => void; note: string }) {
  return (
    <button type="button" className="dr-row" onClick={() => onPick(t.cluster_id)}>
      <span className="dr-row__top">
        <span className="t-mono dr-row__id">{t.devrev_id ?? t.id}</span>
        <PriorityBadge bucket={t.priority_bucket} size="sm" />
      </span>
      <span className="dr-row__title">{t.title}</span>
      <span className="dr-row__meta">
        <span>{STAGE_LABEL[t.stage_key]}</span>
        {t.vendor && <span>{t.vendor}</span>}
        {t.district && <span>{t.district}</span>}
        <span className={t.overdue ? "is-late" : ""}>{note}</span>
      </span>
    </button>
  );
}

export function WorkOrdersPanel({ open, onClose, board, onPick }: {
  open: boolean; onClose: () => void; board: Board | null; onPick: (clusterId: string) => void;
}) {
  const nav = useNavigate();
  const all = useMemo(() => (board?.stages ?? []).flatMap((s) => s.tickets ?? []), [board]);
  const overdue = useMemo(() => all.filter((t) => t.overdue && t.stage_key !== "resolved").sort((a, b) => b.age_s - a.age_s), [all]);
  const esc = useMemo(() => all.filter((t) => t.escalated && t.stage_key !== "resolved"), [all]);
  const totals = board?.totals;
  const max = Math.max(1, ...(board?.stages ?? []).map((s) => s.count));
  const fromDevRev = board?.source === "devrev";
  const overdueBy = (t: BoardTicket) => {
    if (!t.due) return `age ${fmtAge(t.age_s)}`;
    const late = (Date.now() - +new Date(t.due)) / 1000;
    return late > 0 ? `${fmtAge(late)} overdue` : `age ${fmtAge(t.age_s)}`;
  };
  return (
    <Sheet open={open} onClose={onClose} side="right" width={480}
      title={<span className="dr-title"><Workflow size={18} aria-hidden />Work orders<Pill variant={fromDevRev ? "primary" : "neutral"} size="sm" title="Where these numbers come from">{board ? `Source: ${fromDevRev ? "DevRev" : "local board"}` : "Source: loading"}</Pill></span>}>
      <div className="dr-panel">
        {!board || !totals ? (
          <EmptyState compact title="Work orders not available yet" description="The case-flow board has not responded. This refreshes every few seconds." />
        ) : (
          <>
            <div className="dr-tiles">
              <Tile v={totals.open} l="Open" />
              <Tile v={totals.overdue} l="Overdue" tone={totals.overdue ? "late" : undefined} />
              <Tile v={totals.escalated} l="Escalated" tone={totals.escalated ? "esc" : undefined} />
              <Tile v={totals.resolved} l="Resolved" tone="ok" />
              <Tile v={totals.median_ttr ?? "n/a"} l="Median to resolve" />
            </div>

            <section className="dr-sec">
              <h4 className="dr-h">Stage funnel</h4>
              <div className="dr-funnel">
                {board.stages.map((s) => (
                  <div key={s.key} className="dr-funnel__row">
                    <span>{s.label || STAGE_LABEL[s.key]}</span>
                    <span className="dr-funnel__track"><i className={`is-${s.key}`} style={{ width: `${s.count ? Math.max(4, (s.count / max) * 100) : 0}%` }} /></span>
                    <b className="t-num">{s.count}</b>
                  </div>
                ))}
              </div>
              <Button variant="secondary" size="sm" icon={<ArrowRight />} onClick={() => { onClose(); nav("/workflow"); }}>Open case flow</Button>
            </section>

            <section className="dr-sec">
              <h4 className="dr-h"><Timer size={13} aria-hidden />Overdue <span>{overdue.length}</span></h4>
              {overdue.length === 0 ? <p className="dr-none">Nothing is past its deadline.</p> : (
                <div className="dr-list">{overdue.map((t) => <Row key={t.id} t={t} note={overdueBy(t)} onPick={(id) => { onPick(id); onClose(); }} />)}</div>
              )}
            </section>

            <section className="dr-sec">
              <h4 className="dr-h"><Flame size={13} aria-hidden />Escalated <span>{esc.length}</span></h4>
              {esc.length === 0 ? <p className="dr-none">No escalated tickets.</p> : (
                <div className="dr-list">{esc.map((t) => <Row key={t.id} t={t} note={`age ${fmtAge(t.age_s)}`} onPick={(id) => { onPick(id); onClose(); }} />)}</div>
              )}
            </section>
          </>
        )}
      </div>
    </Sheet>
  );
}
