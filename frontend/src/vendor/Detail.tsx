import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { Camera, CheckCircle2, Copy, ImagePlus, Play, Quote, X, Users, TriangleAlert } from "lucide-react";
import type { VendorOrder } from "@contracts";
import { api } from "../lib/api";
import { catLabel } from "../lib/const";
import { compressImage } from "../lib/image";
import { useAsync } from "../lib/hooks";
import {
  Button, IconButton, Pill, PriorityBadge, Skeleton, TicketId, devrevOf, Tooltip, useReducedMotion, useToast, spring,
} from "../components/ui";
import { GeoChips, districtOf, zonesOf } from "../ops/geo";
import { CategoryIcon, MapThumb, Photo, Prop, Timeline, type TLStep } from "./parts";
import { SEVERITY_LABEL, STAGE_LABEL, ago, dueInfo, fmtDate, placeOf, stageOf, titleOf } from "./util";

const STEPS = ["Arrive on site", "Cone off area", "Patch", "Compact", "Photograph"];
const stepStore = new Map<string, boolean[]>();

export interface DetailProps {
  order: VendorOrder;
  afterUrl?: string;
  onStart: (o: VendorOrder) => Promise<void>;
  onFix: (o: VendorOrder, blob: Blob | null, url: string | null) => Promise<void>;
}

export default function Detail({ order, afterUrl, onStart, onFix }: DetailProps) {
  const { cluster: c, ticket: t } = order;
  const stage = stageOf(order);
  const done = stage === "resolved";
  const due = dueInfo(order.due, done);
  const toast = useToast();
  const reduced = useReducedMotion();
  const info = useAsync(() => api.cluster(c.id), [c.id, stage]);

  const [checks, setChecks] = useState<boolean[]>(() => stepStore.get(c.id) ?? STEPS.map(() => false));
  useEffect(() => { stepStore.set(c.id, checks); }, [c.id, checks]);
  const toggle = (i: number) => setChecks((a) => a.map((v, j) => (j === i ? !v : v)));

  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState<"start" | "fix" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const shownAfter = afterUrl ?? preview;

  const pick = useCallback(async (f?: File | null) => {
    if (!f || !f.type.startsWith("image/")) return;
    try {
      const b = await compressImage(f);
      setBlob(b); setPreview(URL.createObjectURL(b));
    } catch (e) { setErr(String((e as Error).message ?? e)); }
  }, []);

  async function start() {
    setBusy("start"); setErr(null);
    try { await onStart(order); }
    catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { setBusy(null); }
  }
  async function fix() {
    setBusy("fix"); setErr(null);
    try {
      await onFix(order, blob, preview);
      setCelebrate(true);
      if (!reduced) confetti({ particleCount: 70, spread: 70, startVelocity: 32, origin: { y: 0.35 }, colors: ["#12B981", "#2457FF", "#0B1B33"], disableForReducedMotion: true });
      toast(`${t?.id ?? "Order"} marked fixed. Neighbors are being notified.`);
    } catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { setBusy(null); }
  }

  const steps = buildTimeline(order, info.data?.timeline ?? []);
  const doneCount = checks.filter(Boolean).length;
  const copyId = () => { try { void navigator.clipboard?.writeText(t?.id ?? c.id); toast("Ticket ID copied"); } catch { /* ignore */ } };

  return (
    <article className="vd-detail" aria-label={`Work order ${t?.id ?? c.id}`}>
      <header className="vd-d-head">
        <div className="vd-d-idrow">
          <TicketId id={t?.id} devrev={devrevOf(t)} />
          <Tooltip label="Copy ticket ID"><IconButton icon={<Copy />} label="Copy ticket ID" size="sm" onClick={copyId} /></Tooltip>
          <span className="spacer" />
          <StagePill stage={stage} />
        </div>
        <h2 className="vd-d-title">{titleOf(c)}</h2>
        <div className="vd-d-sub">
          {!done && <><span className={`vd-due is-${due.tone}`}>{due.text}</span><span aria-hidden>{"·"}</span></>}
          <span>Reported {ago(c.first_reported_at)}</span>
        </div>
        <div className="vd-d-actions">
          {stage === "queued" && <Button icon={<Play />} onClick={start} loading={busy === "start"} variant="secondary">Start work</Button>}
          {!done && <Button icon={<CheckCircle2 />} onClick={fix} loading={busy === "fix"}>Mark fixed</Button>}
          {done && <span className="vd-done-note"><CheckCircle2 size={18} strokeWidth={1.75} /> Resolved{c.fixed_at ? ` ${ago(c.fixed_at)}` : ""}</span>}
        </div>
        {err && <div className="vd-inline-err" role="alert"><TriangleAlert size={16} /> {err}</div>}
      </header>

      {celebrate && (
        <motion.div className="vd-success" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={spring.pop} role="status">
          <svg viewBox="0 0 52 52" width="40" height="40" aria-hidden>
            <motion.circle cx="26" cy="26" r="23" fill="none" stroke="currentColor" strokeWidth="3" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: reduced ? 0 : 0.5 }} />
            <motion.path d="M15 27 l8 8 l15 -17" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: reduced ? 0 : 0.4, delay: reduced ? 0 : 0.35 }} />
          </svg>
          <div><strong>Fixed. Loop closed.</strong><span>{c.reporter_count} reporters are being told the road is repaired.</span></div>
        </motion.div>
      )}

      <section className="vd-hero" aria-label="Issue photo and location">
        <Photo src={c.photo_url} category={c.category} alt={`${catLabel(c.category)} at ${placeOf(c)}`} size="lg" />
        <div className="vd-hero__map"><MapThumb cluster={c} /></div>
      </section>

      <dl className="vd-props">
        <Prop label="Priority"><PriorityBadge bucket={c.bucket} score={c.priority} size="sm" /></Prop>
        <Prop label="Severity">{t ? SEVERITY_LABEL[t.severity] ?? t.severity : `${c.severity}/5`} <span className="vd-faint">{"·"} {c.severity}/5</span></Prop>
        <Prop label="Vendor">{c.vendor ?? "Unassigned"}</Prop>
        <Prop label="Reporters"><span className="vd-reporters"><Users size={14} strokeWidth={1.75} /> <b className="t-num">{c.reporter_count}</b> neighbors</span></Prop>
        <Prop label="Reported">{fmtDate(c.first_reported_at)}</Prop>
        <Prop label="Due"><span className={`vd-due is-${due.tone}`}>{fmtDate(order.due, false)}</span></Prop>
        <Prop label="Category"><span className="vd-cat"><CategoryIcon category={c.category} size={15} /> {catLabel(c.category)}</span></Prop>
        <Prop label="Neighborhood">{c.neighborhood ?? "-"}</Prop>
        {districtOf(c) && <Prop label="District">{districtOf(c)}</Prop>}
        {zonesOf(c).length > 0 && <Prop label="Priority zones" wide><GeoChips c={c} zonesOnly max={4} /></Prop>}
      </dl>

      {(c.rationale || c.hazard_description) && (
        <figure className="vd-quote">
          <Quote size={16} strokeWidth={1.75} aria-hidden />
          <blockquote>
            {c.is_hazard && c.hazard_description ? <><strong>Safety hazard.</strong> {c.hazard_description} </> : null}
            {c.rationale}
          </blockquote>
          <figcaption>Priority rationale, generated by Civic Flow</figcaption>
        </figure>
      )}

      <section className="vd-block" aria-label="Work steps">
        <div className="vd-block__head">
          <h3>Work steps</h3>
          <span className="vd-faint t-num">{doneCount}/{STEPS.length}</span>
        </div>
        <div className="vd-bar" aria-hidden><motion.i animate={{ width: `${(doneCount / STEPS.length) * 100}%` }} transition={spring.soft} /></div>
        <ul className="vd-steps">
          {STEPS.map((s, i) => (
            <li key={s}>
              <label className={checks[i] ? "is-on" : ""}>
                <input type="checkbox" checked={checks[i]} onChange={() => toggle(i)} disabled={done} />
                <span className="vd-check" aria-hidden><svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-6.5" /></svg></span>
                <span>{s}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="vd-block" aria-label="Before and after">
        <div className="vd-block__head"><h3>Before and after</h3><span className="vd-faint">After photo is optional</span></div>
        <div className="vd-ba">
          <figure>
            <Photo src={c.photo_url} category={c.category} alt="Before" size="md" label="No before photo" />
            <figcaption>Before</figcaption>
          </figure>
          <figure>
            {shownAfter ? (
              <div className="vd-after">
                <img src={shownAfter} alt="After repair" />
                {!done && <IconButton className="vd-after__x" icon={<X />} label="Remove after photo" variant="glass" size="sm" onClick={() => { setBlob(null); setPreview(null); }} />}
              </div>
            ) : (
              <button
                type="button" className={`vd-drop ${drag ? "is-drag" : ""}`} disabled={done}
                onClick={() => input.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); void pick(e.dataTransfer.files?.[0]); }}
              >
                <ImagePlus size={26} strokeWidth={1.5} aria-hidden />
                <b>Add after photo</b>
                <span>Drop an image or click to upload</span>
              </button>
            )}
            <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
            <figcaption><Camera size={12} strokeWidth={1.75} /> After</figcaption>
          </figure>
        </div>
      </section>

      <section className="vd-block" aria-label="Activity">
        <div className="vd-block__head"><h3>Activity</h3></div>
        {info.loading && !info.data ? <Skeleton n={4} h={28} /> : <Timeline steps={steps} fmt={(s) => fmtDate(s)} />}
      </section>
    </article>
  );
}

export function StagePill({ stage, size = "md" }: { stage: ReturnType<typeof stageOf>; size?: "sm" | "md" }) {
  const variant = stage === "resolved" ? "success" : stage === "in_progress" ? "in_progress" : "neutral";
  return <Pill variant={variant} dot={stage === "in_progress" ? "pulse" : true} size={size}>{STAGE_LABEL[stage]}</Pill>;
}

function buildTimeline(o: VendorOrder, server: { ts: string; label: string; detail: string }[]): TLStep[] {
  const { cluster: c, ticket: t } = o;
  const stage = stageOf(o);
  const find = (re: RegExp) => server.find((e) => re.test(e.label));
  const tCreated = find(/ticket/i)?.ts ?? t?.created_at ?? c.first_reported_at;
  const prog = find(/progress/i);
  const fixed = find(/fixed|resolved/i);
  const steps: TLStep[] = [
    { key: "rep", label: "Reported", detail: `First report from a neighbor`, ts: c.first_reported_at, state: "done" },
  ];
  if (c.report_count > 1) steps.push({ key: "merge", label: `Merged ${c.report_count - 1} reports`, detail: `${c.reporter_count} unique reporters, one issue`, ts: c.last_reported_at, state: "done" });
  steps.push({ key: "prio", label: `Priority ${c.bucket} (${Math.round(c.priority)})`, detail: `Severity ${c.severity}/5${c.is_hazard ? ", safety hazard" : ""}`, ts: tCreated, state: "done" });
  if (t) steps.push({ key: "ticket", label: "Ticket created", detail: t.id, ts: tCreated, state: "done" });
  steps.push({ key: "vendor", label: "Vendor assigned", detail: c.vendor ?? "Pending", ts: tCreated, state: c.vendor ? "done" : "todo" });
  steps.push({ key: "prog", label: "Work in progress", detail: stage !== "queued" ? "Crew on site" : "Waiting for crew", ts: prog?.ts ?? t?.updated_at, state: stage === "queued" ? "current" : "done" });
  steps.push({ key: "fixed", label: "Fixed", detail: stage === "resolved" ? "Reporters notified" : undefined, ts: fixed?.ts ?? c.fixed_at ?? undefined, state: stage === "resolved" ? "done" : stage === "in_progress" ? "current" : "todo", tone: "success" });
  return steps;
}
