import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import {
  AlertTriangle, ArrowUpRight, Camera, CheckCircle2, CircleDot, ExternalLink, FileText, GitMerge, Layers, MapPin,
  MessageSquare, Play, RotateCcw, Route, Send, ShieldCheck, Siren, Ticket as TicketIcon, Users, Workflow, Zap,
} from "lucide-react";
import type { Category } from "@contracts";
import { Page } from "../components/shell/Page";
import {
  Button, EmptyState, Pill, Sheet, Skeleton, spring, useMediaQuery, useReducedMotion, useToast,
} from "../components/ui";
import {
  api, devrevAction, devrevBoard, devrevEvents, devrevJourney,
  type BoardStage, type BoardTicket, type CfStageKey, type DevrevActionName, type DevrevBoard, type DevrevEvent,
  type DevrevJourney, type JourneyStep,
} from "../lib/api";
import "./workflow.css";

/* ---------- helpers ---------- */
const STAGE_META: Record<CfStageKey, { label: string; hint: string }> = {
  queued: { label: "Queued", hint: "Waiting for a crew" },
  assigned: { label: "Assigned", hint: "Vendor picked" },
  in_progress: { label: "In progress", hint: "Crew on site" },
  awaiting_verification: { label: "Awaiting verification", hint: "Fix submitted" },
  resolved: { label: "Resolved", hint: "Closed in DevRev" },
};
const STAGE_ORDER: CfStageKey[] = ["queued", "assigned", "in_progress", "awaiting_verification", "resolved"];

function fmtAge(s: number | null | undefined): string {
  if (s == null || !isFinite(s)) return "n/a";
  s = Math.max(0, Math.round(s));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.round((s % 86400) / 3600)}h`;
}
function relTime(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (isNaN(t)) return "";
  const d = Math.max(0, Math.round((now - t) / 1000));
  if (d < 5) return "just now";
  return `${fmtAge(d)} ago`;
}
const absTime = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

const ACTIONS: { key: DevrevActionName; label: string; icon: ReactElement; stages: CfStageKey[]; tone: "primary" | "secondary" }[] = [
  { key: "start", label: "Start work", icon: <Play />, stages: ["queued", "assigned"], tone: "primary" },
  { key: "request_verification", label: "Request verification", icon: <ShieldCheck />, stages: ["in_progress"], tone: "secondary" },
  { key: "approve", label: "Approve and resolve", icon: <CheckCircle2 />, stages: ["awaiting_verification", "in_progress"], tone: "primary" },
  { key: "escalate", label: "Escalate", icon: <Siren />, stages: ["queued", "assigned", "in_progress", "awaiting_verification"], tone: "secondary" },
  { key: "reopen", label: "Reopen", icon: <RotateCcw />, stages: ["resolved", "awaiting_verification"], tone: "secondary" },
];

const KIND_ICON: Record<JourneyStep["kind"], ReactElement> = {
  report: <Send />, vision: <Camera />, geofence: <MapPin />, dedup: <GitMerge />, priority: <Zap />, routing: <Route />,
  created: <TicketIcon />, stage: <Layers />, comment: <MessageSquare />, escalated: <Siren />,
  verification: <ShieldCheck />, resolved: <CheckCircle2 />, reopened: <RotateCcw />,
};

function SourceTag({ source }: { source: string }) {
  const dev = source.toLowerCase() === "devrev";
  return (
    <span className={`wf-src ${dev ? "is-dev" : "is-cf"}`}>
      {dev ? <Workflow aria-hidden /> : <CircleDot aria-hidden />}
      {dev ? "DevRev" : "Civic Flow"}
    </span>
  );
}

/* ---------- ticket card ---------- */
function TicketCard({ t, selected, onSelect, reduced }: { t: BoardTicket; selected: boolean; onSelect: () => void; reduced: boolean }) {
  const where = [t.neighborhood, t.district].filter(Boolean).join(" · ");
  return (
    <motion.button
      layout={!reduced} layoutId={reduced ? undefined : `tk-${t.id}`} transition={spring.snappy}
      initial={reduced ? false : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
      type="button" className={`wf-card ${selected ? "is-selected" : ""} ${t.overdue ? "is-overdue" : ""}`}
      onClick={onSelect} aria-pressed={selected}
    >
      <div className="wf-card-top">
        <span className="t-mono wf-card-id">{t.devrev_id ?? "local"}</span>
        <span className="t-mono wf-card-cf">{t.id}</span>
        <i className={`wf-sev sev-${t.severity}`} title={`Severity: ${t.severity}`} />
        <Pill variant={t.priority_bucket} size="sm">{t.priority_bucket}</Pill>
      </div>
      <div className="wf-card-title">{t.title}</div>
      {where && <div className="wf-card-meta"><MapPin aria-hidden /><span>{where}</span></div>}
      {t.vendor && <div className="wf-card-meta"><Users aria-hidden /><span>{t.vendor}</span></div>}
      <div className="wf-card-foot">
        {t.zones.slice(0, 1).map((z) => <Pill key={z} variant="outline" size="sm">{z}</Pill>)}
        {t.overdue && <Pill variant="hazard" size="sm" icon={<AlertTriangle />}>Overdue</Pill>}
        {t.escalated && <Pill variant="P1" size="sm" icon={<Siren />}>Escalated</Pill>}
        <span className="grow" />
        {t.evidence_count > 0 && <span className="wf-card-stat" title="Evidence items"><Camera aria-hidden />{t.evidence_count}</span>}
        <span className="wf-card-stat" title="Reporters"><Users aria-hidden />{t.reporters}</span>
        <span className="wf-card-stat t-mono" title="Age">{fmtAge(t.age_s)}</span>
      </div>
    </motion.button>
  );
}

/* ---------- journey panel ---------- */
function JourneyPanel({ ticketId, board, onChanged, reduced }: {
  ticketId: string; board: BoardTicket | null; onChanged: (t: BoardTicket | null) => void; reduced: boolean;
}) {
  const toast = useToast();
  const [j, setJ] = useState<DevrevJourney | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<DevrevActionName | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteFor, setNoteFor] = useState<DevrevActionName | null>(null);
  const [now, setNow] = useState(Date.now());
  const stageSeen = useRef<string>("");

  const load = useCallback(async () => {
    try { setJ(await devrevJourney(ticketId)); setErr(null); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not load the journey"); }
  }, [ticketId]);

  useEffect(() => { setJ(null); setErr(null); setMsg(null); setNote(""); setNoteFor(null); stageSeen.current = ""; load(); }, [load]);
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 5000); return () => window.clearInterval(id); }, []);
  // reload the timeline when the board shows a different stage / escalation for this ticket
  const sig = board ? `${board.stage_key}|${board.escalated}|${board.evidence_count}|${board.severity}` : "";
  useEffect(() => {
    if (!sig) return;
    if (stageSeen.current && stageSeen.current !== sig) load();
    stageSeen.current = sig;
  }, [sig, load]);

  const t = board ?? j?.ticket ?? null;

  const run = async (a: DevrevActionName, n?: string) => {
    setBusy(a); setMsg(null);
    try {
      const r = await devrevAction(ticketId, a, n?.trim() || null);
      if (!r.ok) { setMsg(r.error || "That action is not available right now."); return; }
      toast(`${ACTIONS.find((x) => x.key === a)?.label ?? "Action"} done`);
      setNote(""); setNoteFor(null);
      onChanged(r.ticket);
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally { setBusy(null); }
  };

  const click = (a: DevrevActionName) => {
    if (a === "approve" || a === "escalate") {
      if (noteFor !== a) { setNoteFor(a); setMsg(null); return; }
      if (a === "approve" && !note.trim()) { setMsg("Add a short note describing the evidence (for example, what was fixed)."); return; }
      run(a, note);
    } else run(a);
  };

  if (!t && err) return <div className="wf-jerr"><AlertTriangle aria-hidden /><span>{err}</span><Button size="sm" variant="secondary" onClick={load}>Retry</Button></div>;
  if (!t) return <div className="wf-jbody"><Skeleton height={64} /><Skeleton n={4} h={56} /></div>;

  return (
    <div className="wf-journey">
      <div className="wf-jhead">
        <div className="wf-jids">
          <span className="t-mono wf-card-id">{t.devrev_id ?? "No DevRev ticket"}</span>
          <span className="t-mono wf-card-cf">{t.id}</span>
          <Pill variant={t.priority_bucket} size="sm">{t.priority_bucket}</Pill>
          <Pill variant="neutral" size="sm">{STAGE_META[t.stage_key].label}</Pill>
        </div>
        <h3 className="wf-jtitle">{t.title}</h3>
        <div className="wf-jmeta">
          {[t.neighborhood, t.district].filter(Boolean).join(" · ") || "Location pending"}
          {t.vendor ? ` · ${t.vendor}` : ""}
          {` · ${t.reporters} reporter${t.reporters === 1 ? "" : "s"}`}
        </div>
        {t.web_url && <a className="wf-open" href={t.web_url} target="_blank" rel="noreferrer"><ExternalLink aria-hidden />Open in DevRev</a>}
      </div>

      <div className="wf-actions">
        {ACTIONS.map((a) => {
          const enabled = a.stages.includes(t.stage_key) && !(a.key === "escalate" && t.severity === "blocker");
          return (
            <Button key={a.key} size="sm" variant={noteFor === a.key ? "primary" : a.tone}
              icon={a.icon} loading={busy === a.key} disabled={!enabled || (busy !== null && busy !== a.key)} onClick={() => click(a.key)}>
              {a.label}
            </Button>
          );
        })}
      </div>
      <AnimatePresence initial={false}>
        {noteFor && (
          <motion.div className="wf-note" initial={reduced ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <label htmlFor="wf-note">{noteFor === "approve" ? "Evidence note (required)" : "Reason for escalation (optional)"}</label>
            <textarea id="wf-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={noteFor === "approve" ? "After photo checked, the repair is complete and the site is safe" : "Why does this need to go up?"} />
            <div className="wf-note-row">
              <Button size="sm" variant="ghost" onClick={() => { setNoteFor(null); setMsg(null); }}>Cancel</Button>
              <Button size="sm" loading={busy === noteFor} onClick={() => click(noteFor)}>{noteFor === "approve" ? "Confirm and resolve" : "Confirm escalation"}</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {msg && <div className="wf-msg" role="alert"><AlertTriangle aria-hidden />{msg}</div>}

      <div className="wf-tl-head t-eyebrow">Journey</div>
      {!j && !err && <div className="wf-jbody"><Skeleton n={4} h={52} /></div>}
      {err && <div className="wf-jerr"><AlertTriangle aria-hidden /><span>{err}</span><Button size="sm" variant="secondary" onClick={load}>Retry</Button></div>}
      {j && (
        <ol className="wf-tl">
          {j.steps.map((s, i) => (
            <motion.li key={`${s.ts}-${s.kind}-${i}`} className={`wf-step ${s.source === "devrev" ? "is-dev" : "is-cf"}`}
              initial={reduced ? false : { opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring.soft, delay: Math.min(i, 8) * 0.025 }}>
              <span className="wf-step-dot">{KIND_ICON[s.kind] ?? <FileText />}</span>
              <div className="wf-step-main">
                <div className="wf-step-row">
                  <b>{s.title}</b>
                  <SourceTag source={s.source} />
                </div>
                {s.detail && <p>{s.detail}</p>}
                <time dateTime={s.ts} title={absTime(s.ts)}>{relTime(s.ts, now)}</time>
              </div>
            </motion.li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ---------- page ---------- */
const PLAZA = { lat: 39.042, lng: -94.595 };
const KC = { lat: 39.0997, lng: -94.5786 };

export default function WorkflowPage() {
  const reduced = useReducedMotion();
  const toast = useToast();
  const narrow = useMediaQuery("(max-width: 1099px)");
  const [board, setBoard] = useState<DevrevBoard | null>(null);
  const [boardErr, setBoardErr] = useState<string | null>(null);
  const [events, setEvents] = useState<DevrevEvent[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [fresh, setFresh] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [b, e] = await Promise.all([devrevBoard(), devrevEvents(8).catch(() => null)]);
      setBoard(b); setBoardErr(null); setFresh(true);
      if (e) setEvents(e.slice(0, 8));
    } catch (err) {
      const m = err instanceof Error ? err.message : "";
      setFresh(false);
      // 404 / gateway errors: the backend is still starting or restarting, keep the friendly connecting state
      if (/^(404|500|502|503|504)|not found|bad gateway|unavailable/i.test(m) || /Failed to fetch|NetworkError/i.test(m)) setBoardErr(null);
      else setBoardErr(m || "Could not load the board");
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 4000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearInterval(id); window.clearInterval(clock); };
  }, [refresh]);

  const all = useMemo(() => (board ? board.stages.flatMap((s) => s.tickets) : []), [board]);
  const selTicket = useMemo(() => all.find((t) => t.id === sel || t.cluster_id === sel) ?? null, [all, sel]);

  const stages: BoardStage[] = useMemo(
    () => STAGE_ORDER.map((k) => board?.stages.find((s) => s.key === k) ?? { key: k, label: STAGE_META[k].label, count: 0, avg_age_s: null, tickets: [] }),
    [board],
  );

  const sendSample = async () => {
    setSending(true);
    try {
      const plaza = Math.random() < 0.5;
      const lat = plaza ? PLAZA.lat + (Math.random() - 0.5) * 0.0004 : KC.lat + (Math.random() - 0.5) * 0.14;
      const lng = plaza ? PLAZA.lng + (Math.random() - 0.5) * 0.0004 : KC.lng + (Math.random() - 0.5) * 0.12;
      const r = await api.submitReport({ lat, lng, accuracy_m: 12, category: "pothole" as Category, note: "Case-flow demo: sample report", severity: 3 });
      if (r.outcome === "rejected") { toast(r.reject_reason || r.message || "Report rejected"); return; }
      toast(r.outcome === "merged" ? "Merged into an existing ticket" : "Report sent. A new ticket is on the board");
      if (r.cluster?.id) setSel(r.cluster.id);
      await refresh();
      // the DevRev ticket can take a moment to be mirrored; keep refreshing briefly
      for (let i = 0; i < 3; i++) { await new Promise((res) => setTimeout(res, 1500)); await refresh(); }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not send the report");
    } finally { setSending(false); }
  };

  const onChanged = (t: BoardTicket | null) => {
    if (t) {
      setBoard((b) => b && {
        ...b,
        stages: b.stages
          .map((s) => ({ ...s, tickets: s.tickets.filter((x) => x.id !== t.id) }))
          .map((s) => (s.key === t.stage_key ? { ...s, tickets: [t, ...s.tickets] } : s)),
      });
    }
    refresh();
  };

  const tot = board?.totals;
  const upd = board ? relTime(board.as_of, now) : "";
  const jid = selTicket?.id ?? (sel && sel.startsWith("CF-") ? sel : null);
  const panel = sel ? (jid ? <JourneyPanel key={jid} ticketId={jid} board={selTicket} onChanged={onChanged} reduced={reduced} /> : <div className="wf-jbody"><Skeleton height={64} /><Skeleton n={3} h={56} /></div>) : null;
  const stats: [string, string | number | null | undefined][] = [
    ["Open", tot?.open], ["Overdue", tot?.overdue], ["Escalated", tot?.escalated], ["Resolved", tot?.resolved], ["Median time to resolve", tot?.median_ttr ?? "n/a"],
  ];

  return (
    <Page width="full" className="wf-page">
      <div className="wf">
        <header className="wf-head">
          <div className="wf-head-l">
            <h1 className="t-heading">Case flow</h1>
            <div className="wf-head-chips">
              {board && <Pill variant={board.source === "devrev" ? "primary" : "neutral"} size="sm" icon={<Workflow />}>Source: {board.source === "devrev" ? "DevRev" : "local board"}</Pill>}
              <span className="wf-status"><i className={`wf-live-dot ${fresh ? "" : "off"}`} />{fresh ? "Live" : "Connecting"}{upd && ` · updated ${upd}`}</span>
            </div>
          </div>
          <div className="wf-totals">
            {stats.map(([k, v]) => (
              <div key={k} className={`wf-total ${k === "Overdue" && Number(v) > 0 ? "is-bad" : ""}`}>
                <b className="t-num">{board ? (v ?? 0) : "-"}</b><span>{k}</span>
              </div>
            ))}
          </div>
          <Button variant="secondary" size="sm" icon={<Send />} loading={sending} onClick={sendSample}>Send a sample report</Button>
        </header>

        {events.length > 0 && (
          <div className="wf-strip" aria-label="DevRev activity">
            <span className="wf-strip-label t-eyebrow">Activity</span>
            <div className="wf-strip-scroll">
              {events.map((e, i) => (
                <button type="button" key={`${e.ts}-${e.ticket_id}-${i}`} className="wf-ev" onClick={() => setSel(e.ticket_id)} title={absTime(e.ts)}>
                  {e.source === "DevRev" ? <Workflow aria-hidden className="is-dev" /> : <CircleDot aria-hidden />}
                  <span className="t-mono">{e.devrev_id ?? e.ticket_id}</span>
                  <span className="wf-ev-text">{e.devrev_id ? e.text.replace(new RegExp("^" + e.devrev_id + ":? "), "") : e.text}</span>
                  <span className="wf-ev-t">{relTime(e.ts, now)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {!board ? (
          boardErr ? (
            <div className="wf-jerr"><AlertTriangle aria-hidden /><span>{boardErr}</span><Button size="sm" variant="secondary" onClick={refresh}>Retry</Button></div>
          ) : (
            <div className="wf-connect">
              <div className="wf-connect-msg"><span className="wf-live-dot off" />Connecting to the DevRev board. This takes a moment.</div>
              <div className="wf-cols">{STAGE_ORDER.map((k) => <div key={k} className="wf-col"><Skeleton height={44} /><Skeleton n={3} h={120} /></div>)}</div>
            </div>
          )
        ) : (
          <div className={`wf-layout ${sel && !narrow ? "has-panel" : ""}`}>
            <div className="wf-board">
              {boardErr && <div className="wf-msg" role="alert"><AlertTriangle aria-hidden />{boardErr}</div>}
              <div className="wf-scroll">
                <LayoutGroup>
                  <div className="wf-cols">
                    <div className="wf-line" aria-hidden />
                    {stages.map((s) => (
                      <section key={s.key} className={`wf-col stage-${s.key}`} aria-label={STAGE_META[s.key].label}>
                        <div className="wf-col-head">
                          <i className="wf-station" aria-hidden />
                          <div className="wf-col-title"><b>{STAGE_META[s.key].label}</b><span>{s.count} · avg {fmtAge(s.avg_age_s)}</span></div>
                        </div>
                        <div className="wf-col-list">
                          <AnimatePresence initial={false}>
                            {s.tickets.map((t) => (
                              <TicketCard key={t.id} t={t} reduced={reduced} selected={t.id === selTicket?.id} onSelect={() => setSel(t.id)} />
                            ))}
                          </AnimatePresence>
                          {s.tickets.length === 0 && <div className="wf-col-empty">{STAGE_META[s.key].hint}</div>}
                        </div>
                      </section>
                    ))}
                  </div>
                </LayoutGroup>
              </div>
              {all.length === 0 && (
                <EmptyState compact icon={<ArrowUpRight />} title="No tickets yet" description="Send a sample report and it lands in Queued as a real DevRev ticket."
                  action={<Button size="sm" icon={<Send />} loading={sending} onClick={sendSample}>Send a sample report</Button>} />
              )}
            </div>
            {!narrow && sel && (
              <aside className="wf-panel" aria-label="Ticket journey">
                <button type="button" className="wf-panel-x" onClick={() => setSel(null)} aria-label="Close journey">Close</button>
                {panel}
              </aside>
            )}
          </div>
        )}
      </div>
      {narrow && (
        <Sheet open={!!sel} onClose={() => setSel(null)} title="Ticket journey" side="bottom">{panel}</Sheet>
      )}
    </Page>
  );
}
