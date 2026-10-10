import { useCallback, useEffect, useRef, useState } from "react";
import { BarChart3, Clock, RefreshCw } from "lucide-react";
import type { Cluster } from "@contracts";
import { api, fetchAppMetrics, fetchWorkOrderStats, type AppMetrics, type WorkOrderStats } from "../lib/api";
import { useEvents } from "../lib/hooks";
import { Button, EmptyState, ErrorState, Pill, Sheet, Skeleton } from "../components/ui";
import "./analytics.css";

const SEV: { key: keyof WorkOrderStats["open_backlog"]; label: string; color: string }[] = [
  { key: "blocker", label: "Blocker", color: "var(--p1)" },
  { key: "high", label: "High", color: "var(--p2)" },
  { key: "medium", label: "Medium", color: "var(--p3)" },
  { key: "low", label: "Low", color: "var(--p4)" },
];
const STAGES: { key: keyof WorkOrderStats["by_stage"]; label: string; color: string }[] = [
  { key: "queued", label: "Queued", color: "var(--p4)" },
  { key: "work_in_progress", label: "In progress", color: "var(--primary)" },
  { key: "resolved", label: "Resolved", color: "var(--success)" },
  { key: "other", label: "Other", color: "var(--line-strong)" },
];

function Bars({ rows, label }: { rows: { label: string; value: number; color: string; note?: string }[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const h = 26, gap = 8, lw = 124, vw = 40, w = 360;
  const H = rows.length * (h + gap) - gap;
  return (
    <svg className="an-bars" viewBox={`0 0 ${w} ${H}`} role="img" aria-label={label}>
      {rows.map((r, i) => {
        const y = i * (h + gap), bw = Math.max(r.value ? 4 : 0, ((w - lw - vw) * r.value) / max);
        return (
          <g key={r.label} transform={`translate(0 ${y})`}>
            <text x={0} y={h / 2 + 4} className="an-bars__label">{r.label.length > 20 ? r.label.slice(0, 19) + "…" : r.label}</text>
            <rect x={lw} y={0} width={w - lw - vw} height={h} rx={6} className="an-bars__track" />
            <rect x={lw} y={0} width={bw} height={h} rx={6} fill={r.color} className="an-bars__bar" />
            <text x={w} y={h / 2 + 4} textAnchor="end" className="an-bars__val">{r.value}{r.note ? ` ${r.note}` : ""}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Big({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <div className="an-big">
      <b className="an-big__v">{value}</b>
      <span className="an-big__l">{label}</span>
      {hint && <span className="an-big__h">{hint}</span>}
    </div>
  );
}

/** Reports vs unique issues vs duplicates: one stacked bar makes the dedup ratio obvious. */
function DedupBar({ m }: { m: AppMetrics }) {
  const total = Math.max(1, m.total_reports);
  const uniq = (m.unique_issues / total) * 100;
  return (
    <div className="an-dedup">
      <div className="an-dedup__bar" role="img" aria-label={`${m.unique_issues} unique issues, ${m.duplicates_absorbed} duplicates absorbed`}>
        <i style={{ width: `${Math.max(uniq, m.unique_issues ? 1.5 : 0)}%`, background: "var(--primary)" }} />
        <i style={{ flex: 1, background: "var(--success)", opacity: 0.35 }} />
      </div>
      <div className="an-dedup__legend">
        <span><i style={{ background: "var(--primary)" }} />Unique issues <b>{m.unique_issues}</b></span>
        <span><i style={{ background: "var(--success)", opacity: 0.5 }} />Duplicates absorbed <b>{m.duplicates_absorbed}</b></span>
      </div>
    </div>
  );
}

function Section({ title, chip, chipVariant, children }: { title: string; chip: string; chipVariant: "primary" | "neutral"; children: React.ReactNode }) {
  return (
    <section className="an-sec">
      <header className="an-sec__head">
        <h3 className="t-title">{title}</h3>
        <Pill variant={chipVariant} size="sm" title="Where these numbers come from">{chip}</Pill>
      </header>
      {children}
    </section>
  );
}

function fmtTime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(+d) ? "" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function HoodBlock({ cl }: { cl: Cluster[] | null }) {
  if (!cl) return <div className="an-skel"><Skeleton height={90} /><Skeleton height={90} /></div>;
  const agg = new Map<string, { open: number; reports: number }>();
  cl.forEach((c) => {
    if (!c.neighborhood) return;
    const a = agg.get(c.neighborhood) ?? { open: 0, reports: 0 };
    if (c.status !== "fixed") a.open += 1;
    a.reports += c.report_count;
    agg.set(c.neighborhood, a);
  });
  const top = (k: "open" | "reports") => [...agg.entries()].filter(([, v]) => v[k] > 0).sort((a, b) => b[1][k] - a[1][k]).slice(0, 6).map(([n, v]) => ({ label: n, value: v[k], color: k === "open" ? "var(--primary)" : "var(--p4)" }));
  const open = top("open"), rep = top("reports");
  if (!open.length && !rep.length) return <p className="an-empty">No neighborhood data yet.</p>;
  return (
    <>
      <h4 className="an-h">Open issues <span>top {open.length}</span></h4>
      <Bars label="Open issues by neighborhood" rows={open} />
      <h4 className="an-h">Reports received <span>top {rep.length}</span></h4>
      <Bars label="Reports by neighborhood" rows={rep} />
      <p className="an-note">Neighborhoods come from Kansas City boundary polygons; counts are computed from current issues.</p>
    </>
  );
}

export default function AnalyticsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [wo, setWo] = useState<WorkOrderStats | null>(null);
  const [app, setApp] = useState<AppMetrics | null>(null);
  const [woErr, setWoErr] = useState<string | null>(null);
  const [appErr, setAppErr] = useState<string | null>(null);
  const [cl, setCl] = useState<Cluster[] | null>(null);
  const [busy, setBusy] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;

  const load = useCallback(async () => {
    setBusy(true);
    await Promise.all([
      fetchWorkOrderStats().then((d) => { setWo(d); setWoErr(null); }).catch((e) => setWoErr(String(e.message ?? e))),
      api.clusters({ limit: 500 }).then(setCl).catch(() => {}),
      fetchAppMetrics().then((d) => { setApp(d); setAppErr(null); }).catch((e) => setAppErr(String(e.message ?? e))),
    ]);
    setBusy(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [open, load]);

  // Refresh shortly after ticket events (debounced; the API caches DevRev reads for 15 s anyway).
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEvents((e) => {
    if (!openRef.current || !e.type.startsWith("ticket.")) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void load(), 1500);
  });
  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current); }, []);

  const fromDevRev = wo?.source === "devrev";
  return (
    <Sheet open={open} onClose={onClose} side="right" width={480} title={<span className="an-title"><BarChart3 size={18} aria-hidden />Analytics</span>}>
      <div className="an">
        <div className="an-bar">
          <span className="an-bar__t"><Clock size={13} aria-hidden />{wo ? `Updated ${fmtTime(wo.as_of)}` : "Loading"}</span>
          <Button variant="secondary" size="sm" icon={<RefreshCw className={busy ? "an-spin" : ""} />} onClick={() => void load()} disabled={busy}>Refresh</Button>
        </div>

        <Section title="Work orders" chip={wo ? `Source: ${fromDevRev ? "DevRev" : "local board"}` : "Source: loading"} chipVariant={fromDevRev ? "primary" : "neutral"}>
          {woErr && !wo ? <ErrorState compact title="Work-order stats unavailable" message={woErr} onRetry={() => void load()} /> : !wo ? (
            <div className="an-skel"><Skeleton height={64} /><Skeleton height={110} /><Skeleton height={90} /></div>
          ) : wo.total === 0 ? (
            <EmptyState compact title="No work orders yet" description="Tickets appear here as soon as a report creates one." />
          ) : (
            <>
              <div className="an-bigs">
                <Big value={String(wo.resolved)} label="Resolved" hint={`of ${wo.total} work orders`} />
                <Big value={wo.median_ttr ?? "n/a"} label="Median time to resolve" hint={wo.median_ttr ? (wo.p90_ttr ? `p90 ${wo.p90_ttr}` : undefined) : "no resolved tickets yet"} />
              </div>
              <h4 className="an-h">Stage funnel</h4>
              <Bars label="Tickets by stage" rows={STAGES.filter((s) => s.key !== "other" || wo.by_stage.other > 0).map((s) => ({ label: s.label, value: wo.by_stage[s.key], color: s.color }))} />
              <h4 className="an-h">Open backlog by severity <span>{wo.open_total} open{wo.oldest_open ? `, oldest ${wo.oldest_open}` : ""}</span></h4>
              <Bars label="Open backlog by severity" rows={SEV.map((s) => ({ label: s.label, value: wo.open_backlog[s.key], color: s.color }))} />
              <h4 className="an-h">By vendor <span>{wo.created_last_hour} created in the last hour</span></h4>
              <Bars label="Tickets by vendor" rows={wo.vendors.slice(0, 6).map((v) => ({ label: v.vendor, value: v.total, color: "var(--primary)"}))} />
            </>
          )}
        </Section>

        <Section title="Reports and AI" chip="Source: Civic Flow" chipVariant="neutral">
          {appErr && !app ? <ErrorState compact title="App metrics unavailable" message={appErr} onRetry={() => void load()} /> : !app ? (
            <div className="an-skel"><Skeleton height={64} /><Skeleton height={90} /></div>
          ) : (
            <>
              <div className="an-bigs">
                <Big value={app.total_reports.toLocaleString()} label="Reports received" hint={`${app.unique_issues} unique issues`} />
                <Big value={`${Math.round(app.dedup_ratio * 100)}%`} label="Absorbed as duplicates" hint={`${app.llm_calls_avoided.toLocaleString()} AI calls avoided`} />
              </div>
              {app.total_reports > 0 && <DedupBar m={app} />}
              <div className="an-bigs an-bigs--tight">
                <Big value={app.geo_cache_hit_rate == null ? "n/a" : `${Math.round(app.geo_cache_hit_rate * 100)}%`} label="Geo-cache hit rate" hint={app.geo_cache_lookups ? `${app.geo_cache_lookups} lookups, avg ${app.geo_cache_avg_ms} ms` : "no lookups yet"} />
                {app.vision_reports != null && <Big value={String(app.vision_reports)} label="Vision-analysed" />}
              </div>
              <h4 className="an-h">AI calls</h4>
              {app.ai_usage.length === 0 ? <p className="an-empty">No AI calls recorded yet.</p> : (
                <table className="an-table">
                  <thead><tr><th>Provider</th><th>Calls</th><th>Avg latency</th></tr></thead>
                  <tbody>
                    {app.ai_usage.map((u) => (
                      <tr key={u.label}><td>{u.label}</td><td className="t-num">{u.calls}{u.errors ? <em> ({u.errors} failed)</em> : null}</td><td className="t-num">{u.avg_ms ? `${Math.round(u.avg_ms)} ms` : "n/a"}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </Section>
        <Section title="By neighborhood" chip="Source: Civic Flow" chipVariant="neutral">
          <HoodBlock cl={cl} />
        </Section>
      </div>
    </Sheet>
  );
}
