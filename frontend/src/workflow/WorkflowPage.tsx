import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { animate, motion, useMotionValue } from "framer-motion";
import {
  Bell, Camera, CircleCheck, Cpu, Database, Gauge, GitMerge, Play, RotateCcw, Scale, Send, Smartphone,
  Sparkles, Ticket as TicketIcon, Truck, Wrench, Zap, Radio, Hand,
} from "lucide-react";
import type { Category, CivicEvent, Cluster, ReportResult, Ticket } from "@contracts";
import { Page } from "../components/shell/Page";
import { AnimatedNumber, Button, Pill, SegmentedControl, spring, useReducedMotion } from "../components/ui";
import { api } from "../lib/api";
import "./workflow.css";

/* ---------- geometry ---------- */
const W = 1280;
const LANE_H = 144;
const LABEL_W = 204;
const COL0 = 268;
const COL_D = 105;
const H = LANE_H * 5;
const R = 28;

const LANES = [
  { name: "Citizen", sub: "Phone app", icon: Smartphone },
  { name: "Edge and Engine", sub: "Fast path, no AI", icon: Zap },
  { name: "AI Agents", sub: "Only when needed", icon: Sparkles },
  { name: "Tickets", sub: "DevRev-ready board", icon: TicketIcon },
  { name: "Vendor", sub: "City crews", icon: Truck },
];

interface Station {
  n: number; lane: number; label: string[]; icon: typeof Camera;
  tech: string; title: string; what: string;
}
const STATIONS: Station[] = [
  { n: 1, lane: 0, label: ["Report sent"], icon: Camera, tech: "Citizen app", title: "Report sent",
    what: "A photo and a GPS fix leave the phone in one request. Fixes worse than 100 m are turned away so every report lands on the right street." },
  { n: 2, lane: 1, label: ["Edge cache", "check"], icon: Zap, tech: "Akamai EdgeKV edge cache", title: "Edge cache check",
    what: "The report's geohash cell is looked up at the edge. A hit answers in about a millisecond with the open issues nearby, so the origin is barely touched." },
  { n: 3, lane: 1, label: ["Dedup", "engine"], icon: GitMerge, tech: "Dedup engine, plain Python", title: "Dedup engine",
    what: "Every nearby open issue is scored on distance, category and time. 0.75 or higher merges, 0.50 to 0.75 asks the judge, below that creates a new issue. No AI is involved." },
  { n: 4, lane: 2, label: ["AI judge"], icon: Scale, tech: "Strands agent on Akamai AI inference", title: "AI judge",
    what: "Only the unclear band reaches the judge. It weighs the candidates and answers merge or new, with a reason. Everything else skips it, which is how thousands of reports avoid thousands of LLM calls." },
  { n: 5, lane: 2, label: ["Priority", "scored"], icon: Gauge, tech: "Priority formula + LLM rationale", title: "Priority scored",
    what: "Severity, unique reporters, hazard, location and age blend into one score from 0 to 100. P1 starts at 80. Every extra neighbor nudges it up, so a pile of duplicates becomes urgency." },
  { n: 6, lane: 3, label: ["Ticket", "created"], icon: TicketIcon, tech: "Ticket board, DevRev-shaped", title: "Ticket created",
    what: "One issue gets exactly one ticket, no matter how many people reported it. Severity maps from the priority bucket. The board is a mock today and the shape matches DevRev." },
  { n: 7, lane: 4, label: ["Vendor", "assigned"], icon: Truck, tech: "Vendor routing", title: "Vendor assigned",
    what: "The category decides the crew: roads, lighting or green services. The vendor sees a single work order with the reporter count attached." },
  { n: 8, lane: 4, label: ["Work in", "progress"], icon: Wrench, tech: "Ticket stage: work_in_progress", title: "Work in progress",
    what: "The crew starts the job and the ticket stage moves. Everyone who reported it sees the status change on their phone." },
  { n: 9, lane: 4, label: ["Fixed"], icon: CircleCheck, tech: "Ticket stage: resolved", title: "Fixed",
    what: "The vendor marks the work done. The ticket resolves, the issue turns green on the map, and the loop closes." },
  { n: 10, lane: 0, label: ["Citizen", "notified"], icon: Bell, tech: "Events stream + XP engine", title: "Citizen notified",
    what: "Every reporter gets the news and XP: 100 for the first reporter, 20 for the others. Fixing a thing is the reward for reporting it." },
];

const sx = (i: number) => COL0 + i * COL_D;
const sy = (i: number) => STATIONS[i].lane * LANE_H + 40;
type Pt = { x: number; y: number };
const P = (i: number): Pt => ({ x: sx(i), y: sy(i) });

interface Route { key: string; pts: Pt[]; branch?: boolean; label?: string; lx?: number; ly?: number }

function mainRoute(a: number, b: number): Route {
  const A = P(a), B = P(b);
  let pts: Pt[];
  if (a === 8 && b === 9) pts = [A, { x: B.x, y: A.y }, B];
  else if (A.y === B.y) pts = [A, B];
  else { const mx = (A.x + B.x) / 2; pts = [A, { x: mx, y: A.y }, { x: mx, y: B.y }, B]; }
  return { key: `${a}-${b}`, pts };
}
const ROUTES: Route[] = [
  ...Array.from({ length: 9 }, (_, i) => mainRoute(i, i + 1)),
  { key: "2-4", branch: true, label: "Clear match or clear new", lx: (sx(2) + sx(4)) / 2 + 6, ly: sy(2) - 12,
    pts: [P(2), { x: sx(4), y: sy(2) }, P(4)] },
  { key: "4-9", branch: true, label: "Duplicate: merged, no new ticket", lx: (sx(4) + 30 + sx(9)) / 2 + 20, ly: sy(9) - 12,
    pts: [P(4), { x: sx(4) + 30, y: sy(4) }, { x: sx(4) + 30, y: sy(9) }, P(9)] },
];
const routeKey = (a: number, b: number) => (ROUTES.find((r) => r.key === `${a}-${b}`) ? `${a}-${b}` : null);

function pathD(pts: Pt[], r = 16): string {
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
    const l1 = Math.hypot(p1.x - p0.x, p1.y - p0.y), l2 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const a = { x: p1.x - ((p1.x - p0.x) / l1) * rr, y: p1.y - ((p1.y - p0.y) / l1) * rr };
    const b = { x: p1.x + ((p2.x - p1.x) / l2) * rr, y: p1.y + ((p2.y - p1.y) / l2) * rr };
    d += ` L ${a.x} ${a.y} Q ${p1.x} ${p1.y} ${b.x} ${b.y}`;
  }
  const e = pts[pts.length - 1];
  return d + ` L ${e.x} ${e.y}`;
}

/* ---------- state ---------- */
type SState = "idle" | "active" | "done" | "skipped" | "warn" | "success";
interface Out { t: string; tone?: "hazard" | "success" | "muted" }
interface LogLine { id: number; ts: Date; text: string; tone?: "success" | "hazard" | "muted" }
type Phase = "idle" | "sending" | "playing" | "await_work" | "await_fix" | "done" | "merged" | "live" | "error";
type Force = "random" | "new" | "dup";

const fresh = <T,>(v: T): T[] => Array.from({ length: 10 }, () => v);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const cut = (s: string, n = 13) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const fmtMs = (ms: number) => (ms < 0.05 ? "<0.1 ms" : `${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms`);
const stamp = (d: Date) => d.toLocaleTimeString([], { hour12: false }) + "." + String(d.getMilliseconds()).padStart(3, "0");

function parseDedup(summary: string) {
  const edge = /edge (HIT|MISS) ([\d.]+) ms/i.exec(summary);
  const dec = /decision=(\w+)/.exec(summary);
  const score = /score=([\d.]+)/.exec(summary);
  return {
    hit: edge ? edge[1].toUpperCase() === "HIT" : undefined,
    ms: edge ? parseFloat(edge[2]) : undefined,
    decision: dec?.[1], score: score ? parseFloat(score[1]) : undefined,
  };
}

const KC = { lat: 39.0997, lng: -94.5786 };
function samplePoint(force: Force) {
  const dup = force === "dup" || (force === "random" && Math.random() < 0.5);
  if (dup) return { dup: true, lat: 39.042 + (Math.random() - 0.5) * 0.0002, lng: -94.595 + (Math.random() - 0.5) * 0.0002 };
  return { dup: false, lat: KC.lat + (Math.random() - 0.5) * 0.14, lng: KC.lng + (Math.random() - 0.5) * 0.12 };
}

/* ---------- page ---------- */
export default function WorkflowPage() {
  const reduced = useReducedMotion();
  const [mode, setMode] = useState<"guided" | "live">("guided");
  const [force, setForce] = useState<Force>("random");
  const [phase, setPhase] = useState<Phase>("idle");
  const [states, setStates] = useState<SState[]>(fresh<SState>("idle"));
  const [outs, setOuts] = useState<(Out | undefined)[]>(fresh<Out | undefined>(undefined));
  const [lit, setLit] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [focusStation, setFocusStation] = useState(0);
  const [log, setLog] = useState<LogLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [stats, setStats] = useState<{ total_reports: number; duplicates_absorbed: number; llm_calls_avoided: number } | null>(null);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [busy, setBusy] = useState(false);

  const tok = useRef(0);
  const logId = useRef(0);
  const pos = useRef(0);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const px = useMotionValue(sx(0));
  const py = useMotionValue(sy(0));
  const [packetOn, setPacketOn] = useState(false);

  const addLog = useCallback((text: string, tone?: LogLine["tone"]) => {
    setLog((l) => [{ id: ++logId.current, ts: new Date(), text, tone }, ...l].slice(0, 80));
  }, []);

  const resetDiagram = useCallback(() => {
    setStates(fresh<SState>("idle"));
    setOuts(fresh<Out | undefined>(undefined));
    setLit({});
    setPacketOn(false);
    pos.current = 0;
  }, []);

  const setSt = useCallback((i: number, s: SState) => setStates((a) => a.map((v, k) => (k === i ? s : v))), []);
  const setOut = useCallback((i: number, o?: Out) => setOuts((a) => a.map((v, k) => (k === i ? o : v))), []);

  /** Move the glowing packet to station i, drawing the route on the way. Resolves when it arrives. */
  const goTo = useCallback(async (i: number, my: number, ambient = false) => {
    const from = pos.current;
    const key = from !== i ? routeKey(from, i) : null;
    const route = key ? ROUTES.find((r) => r.key === key)! : null;
    const pts = route ? route.pts : [P(from), P(i)];
    setPacketOn(true);
    if (key) setLit((l) => ({ ...l, [key]: true }));
    if (from !== i || ambient) {
      if (reduced) { px.set(pts[pts.length - 1].x); py.set(pts[pts.length - 1].y); }
      else {
        const dur = clamp(0.35 + 0.0016 * pts.reduce((s, p, k) => (k ? s + Math.hypot(p.x - pts[k - 1].x, p.y - pts[k - 1].y) : s), 0), 0.4, 1.1);
        const times = (() => {
          const seg = pts.map((p, k) => (k ? Math.hypot(p.x - pts[k - 1].x, p.y - pts[k - 1].y) : 0));
          const tot = seg.reduce((a, b) => a + b, 0) || 1;
          let acc = 0;
          return seg.map((s) => (acc += s) / tot);
        })();
        await Promise.all([
          animate(px, pts.map((p) => p.x), { duration: dur, ease: "easeInOut", times }),
          animate(py, pts.map((p) => p.y), { duration: dur, ease: "easeInOut", times }),
        ]);
      }
    }
    if (tok.current !== my) throw new Error("cancelled");
    pos.current = i;
    setFocusStation(i);
  }, [px, py, reduced]);

  /** Beat: packet arrives, station glows, dwell, settle with an output. */
  const beat = useCallback(async (i: number, my: number, o: { dwell?: number; end?: SState; out?: Out; log?: string; tone?: LogLine["tone"] } = {}) => {
    await goTo(i, my);
    setSt(i, "active");
    if (o.log) addLog(o.log, o.tone);
    if (o.out) setOut(i, o.out);
    await sleep(reduced ? 120 : o.dwell ?? 600);
    if (tok.current !== my) throw new Error("cancelled");
    setSt(i, o.end ?? "done");
  }, [goTo, setSt, setOut, addLog, reduced]);

  const skip = useCallback((i: number, out?: Out) => { setSt(i, "skipped"); if (out) setOut(i, out); }, [setSt, setOut]);

  /* ---------- stats ---------- */
  const loadStats = useCallback(() => {
    api.stats().then((s) => setStats(s)).catch(() => undefined);
  }, []);
  useEffect(() => { loadStats(); const t = setInterval(loadStats, 5000); return () => clearInterval(t); }, [loadStats]);

  /* ---------- ambient preview when idle ---------- */
  useEffect(() => {
    if (phase !== "idle" || reduced) return;
    const my = ++tok.current;
    let alive = true;
    (async () => {
      try {
        await sleep(900);
        while (alive && tok.current === my) {
          resetDiagram();
          const order = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
          for (const i of order) {
            if (i === 3) { setSt(3, "skipped"); continue; }
            await goTo(i, my, true);
            setSt(i, "active");
            await sleep(260);
            if (!alive || tok.current !== my) return;
            setSt(i, "done");
          }
          await sleep(1800);
        }
      } catch { /* cancelled */ }
    })();
    return () => { alive = false; };
  }, [phase, reduced, goTo, resetDiagram, setSt]);

  /* ---------- guided: send a sample report ---------- */
  const send = useCallback(async () => {
    const my = ++tok.current;
    setBusy(true); setError(null); setResult(null); setTicket(null); setCluster(null);
    resetDiagram();
    setPhase("sending");
    const pt = samplePoint(force);
    const category: Category = "pothole";
    px.set(sx(0)); py.set(sy(0)); setPacketOn(true);
    setSt(0, "active"); setFocusStation(0);
    addLog(`Sending a report near ${pt.lat.toFixed(4)}, ${pt.lng.toFixed(4)}`);
    try {
      const xp0 = await api.me().then((m) => m.xp).catch(() => null);
      const r = await api.submitReport({ lat: pt.lat, lng: pt.lng, accuracy_m: 12, category, note: "Workflow demo: sample report", severity: 3 });
      if (tok.current !== my) return;
      setResult(r);
      setPhase("playing");
      const steps = r.steps ?? [];
      const dd = parseDedup(steps.find((s) => s.node === "dedup")?.summary ?? "");
      const judge = steps.find((s) => s.node === "judge" && s.status !== "skipped");
      const edge = r.edge;
      const hit = edge ? edge.hit : dd.hit;
      const edgeMs = edge ? edge.ms : dd.ms;

      if (r.outcome === "rejected") {
        setSt(0, "warn"); setOut(0, { t: "Rejected", tone: "hazard" });
        addLog(r.reject_reason ? `Rejected: ${r.reject_reason}` : r.message, "hazard");
        setPhase("error"); setBusy(false); return;
      }
      await beat(0, my, { out: { t: `±12 m · GPS` }, log: "Report sent: photo and GPS", dwell: 500 });
      await beat(1, my, {
        out: { t: `${hit ? "HIT" : "MISS"} ${edgeMs != null ? fmtMs(edgeMs) : ""}`.trim(), tone: hit ? "success" : "hazard" },
        log: `Edge cache ${hit ? "hit" : "miss"}${edgeMs != null ? ` in ${fmtMs(edgeMs)}` : ""}`, tone: hit ? "success" : undefined,
        dwell: 500 + clamp((edgeMs ?? 0) * 10, 0, 300),
      });
      const decision = (dd.decision ?? (r.outcome === "merged" ? "merge" : "create")).toLowerCase();
      await beat(2, my, {
        out: { t: `${decision.toUpperCase()}${dd.score != null ? ` ${dd.score.toFixed(2)}` : ""}` },
        log: `Dedup engine: ${decision}${dd.score != null ? `, score ${dd.score.toFixed(2)}` : ""}`,
        dwell: 500 + clamp((steps.find((s) => s.node === "dedup")?.ms ?? 0) * 6, 0, 400),
      });
      if (judge) {
        await beat(3, my, { out: { t: cut(judge.summary.split(/[:,]/)[0] || "Judged") }, log: `AI judge: ${judge.summary}`, dwell: 700 });
      } else {
        skip(3, { t: "Not needed", tone: "muted" });
        addLog("AI judge skipped: the match was clear", "muted");
      }
      const cl = r.cluster ?? null;
      setCluster(cl);
      const bucket = cl?.bucket ?? "";
      const pAfter = r.priority_after ?? cl?.priority ?? null;
      await beat(4, my, {
        out: { t: `${bucket}${pAfter != null ? ` · ${Math.round(pAfter)}` : ""}` },
        log: `Priority ${bucket}${pAfter != null ? ` (${pAfter.toFixed(0)}/100)` : ""}${r.priority_before != null && r.priority_before !== pAfter ? `, was ${r.priority_before.toFixed(0)}` : ""}`,
        dwell: 600,
      });
      const tk = r.ticket ?? null;
      setTicket(tk);
      if (r.outcome === "merged") {
        skip(5, { t: tk ? cut(tk.id) : "Reused", tone: "muted" });
        skip(6, { t: "Same crew", tone: "muted" }); skip(7); skip(8);
        addLog(`Merged into ${tk?.id ?? "the existing ticket"}: ${r.neighbors} neighbors now`, "success");
        await beat(9, my, { out: { t: `+${r.points_awarded} XP`, tone: "success" }, log: `Citizen notified, +${r.points_awarded} XP`, tone: "success", end: "success", dwell: 600 });
        setPhase("merged"); setBusy(false); loadStats(); return;
      }
      await beat(5, my, { out: { t: tk?.id ?? "Created", tone: undefined }, log: `Ticket ${tk?.id ?? ""} created${tk ? `, severity ${tk.severity}` : ""}`, dwell: 600 });
      await beat(6, my, { out: { t: cut(tk?.vendor ?? cl?.vendor ?? "Assigned") }, log: `Assigned to ${tk?.vendor ?? cl?.vendor ?? "a city vendor"}`, dwell: 700 });
      addLog(`You earned +${r.points_awarded} XP for the first report`, "success");
      void xp0;
      setPhase("await_work"); setBusy(false); loadStats();
    } catch (e) {
      if ((e as Error).message === "cancelled") return;
      setSt(0, "warn");
      setOut(0, { t: "Failed", tone: "hazard" });
      const msg = (e as Error).message || "Request failed";
      setError(msg); addLog(`Report failed: ${msg}`, "hazard");
      setPhase("error"); setBusy(false);
    }
  }, [force, resetDiagram, px, py, setSt, setOut, addLog, beat, skip, loadStats]);

  /* ---------- guided: advance the ticket ---------- */
  const advance = useCallback(async (stage: "work_in_progress" | "resolved") => {
    if (!ticket) return;
    const my = ++tok.current;
    setBusy(true); setError(null);
    try {
      const xp0 = stage === "resolved" ? await api.me().then((m) => m.xp).catch(() => null) : null;
      const t = await api.advance(ticket.id, stage);
      if (tok.current !== my) return;
      setTicket(t);
      if (stage === "work_in_progress") {
        await beat(7, my, { out: { t: "Crew on site" }, log: `${t.id} moved to work in progress`, dwell: 600 });
        setPhase("await_fix");
      } else {
        if (states[7] !== "done") skip(7, { t: "Skipped", tone: "muted" });
        await beat(8, my, { out: { t: "Resolved", tone: "success" }, log: `${t.id} resolved by ${t.vendor ?? "the crew"}`, tone: "success", end: "success", dwell: 600 });
        const xp1 = await api.me().then((m) => m.xp).catch(() => null);
        const gained = xp0 != null && xp1 != null && xp1 > xp0 ? xp1 - xp0 : null;
        await beat(9, my, {
          out: { t: gained ? `+${gained} XP` : "Notified", tone: "success" },
          log: gained ? `Citizen notified, +${gained} XP awarded` : "Citizen notified",
          tone: "success", end: "success", dwell: 700,
        });
        setPhase("done");
      }
      loadStats();
    } catch (e) {
      if ((e as Error).message === "cancelled") return;
      const msg = (e as Error).message || "Request failed";
      setError(msg); addLog(`Could not update the ticket: ${msg}`, "hazard");
    } finally { if (tok.current === my) setBusy(false); }
  }, [ticket, beat, skip, states, addLog, loadStats]);

  const reset = useCallback(() => {
    tok.current++;
    resetDiagram(); setPhase("idle"); setResult(null); setTicket(null); setCluster(null); setError(null); setBusy(false);
  }, [resetDiagram]);

  /* ---------- live: follow real events ---------- */
  const queue = useRef<CivicEvent[]>([]);
  const draining = useRef(false);
  const idleTimer = useRef<number | undefined>(undefined);
  const liveOut = useRef<Record<string, unknown>>({});

  const handleLive = useCallback(async (e: CivicEvent, my: number) => {
    const d = e.data as Record<string, any>;
    const b = (i: number, o?: Parameters<typeof beat>[2]) => beat(i, my, { dwell: 380, ...o });
    switch (e.type) {
      case "report.received":
        resetDiagram(); liveOut.current = {};
        await b(0, { out: { t: cut(String(d.user_id ?? "citizen")) }, log: `Report received from ${d.user_id}` });
        break;
      case "agent.node": {
        const s = d as { node: string; status: string; summary: string; ms: number };
        if (s.status === "start") break;
        if (s.node === "dedup") {
          const dd = parseDedup(s.summary);
          await b(1, { out: { t: `${dd.hit ? "HIT" : "MISS"} ${dd.ms != null ? fmtMs(dd.ms) : ""}`.trim(), tone: dd.hit ? "success" : "hazard" }, log: s.summary });
          await b(2, { out: { t: `${(dd.decision ?? "done").toUpperCase()}${dd.score != null ? ` ${dd.score.toFixed(2)}` : ""}` } });
        } else if (s.node === "judge") {
          if (s.status === "skipped") skip(3, { t: "Not needed", tone: "muted" });
          else await b(3, { out: { t: "Judged" }, log: `AI judge: ${s.summary}` });
        } else if (s.node === "priority") {
          await b(4, { out: { t: cut(s.summary, 13) }, log: `Priority: ${s.summary}` });
        } else if (s.node === "dispatch") {
          await b(5, { out: { t: "Ticket" }, log: `Dispatch: ${s.summary}` });
        }
        break;
      }
      case "cluster.created": {
        const c = d.cluster as Cluster;
        setStates((a) => a.map((v, k) => (k === 3 && v === "idle" ? "skipped" : v)));
        await b(4, { out: { t: `${c.bucket} · ${Math.round(c.priority)}` }, log: `New issue in ${c.neighborhood ?? "the city"}: ${c.bucket}, ${Math.round(c.priority)}/100`, tone: undefined });
        break;
      }
      case "cluster.merged": {
        const c = d.cluster as Cluster;
        setStates((a) => a.map((v, k) => (k === 3 && v === "idle" ? "skipped" : v)));
        await b(4, { out: { t: `${c.bucket} · ${Math.round(c.priority)}` }, log: `Merged: ${c.reporter_count} reporters now`, tone: "success" });
        skip(5, { t: cut(c.ticket_id ?? "Reused"), tone: "muted" });
        await b(9, { out: { t: `+${d.points ?? 0} XP`, tone: "success" }, end: "success", log: `Citizen notified, +${d.points ?? 0} XP`, tone: "success" });
        break;
      }
      case "ticket.created": {
        const t = d.ticket as Ticket;
        await b(5, { out: { t: t.id }, log: `Ticket ${t.id} created (${t.severity})` });
        await b(6, { out: { t: cut(t.vendor ?? "Assigned") }, log: `Assigned to ${t.vendor ?? "a vendor"}` });
        break;
      }
      case "ticket.updated": {
        const t = d.ticket as Ticket;
        if (t.stage === "work_in_progress") await b(7, { out: { t: "Crew on site" }, log: `${t.id} in progress` });
        else if (t.stage === "resolved") {
          await b(8, { out: { t: "Resolved", tone: "success" }, end: "success", log: `${t.id} resolved`, tone: "success" });
          await b(9, { out: { t: "Notified", tone: "success" }, end: "success", log: "Citizen notified", tone: "success" });
        }
        break;
      }
      default: break;
    }
  }, [beat, resetDiagram, skip]);

  const drain = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;
    const my = ++tok.current;
    setPhase("live");
    try {
      while (queue.current.length && modeRef.current === "live") {
        const e = queue.current.shift()!;
        await handleLive(e, my);
        if (tok.current !== my) return;
      }
    } catch { /* cancelled */ }
    draining.current = false;
    if (tok.current === my && modeRef.current === "live") {
      window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => {
        if (phaseRef.current === "live" && !queue.current.length) { resetDiagram(); setPhase("idle"); }
      }, 7000);
    }
  }, [handleLive, resetDiagram]);

  useEffect(() => {
    const off = api.subscribe((e) => {
      if (modeRef.current !== "live") return;
      if (!["report.received", "agent.node", "cluster.created", "cluster.merged", "ticket.created", "ticket.updated"].includes(e.type)) return;
      queue.current.push(e);
      if (queue.current.length > 14) queue.current.splice(0, queue.current.length - 14);
      window.clearTimeout(idleTimer.current);
      void drain();
    }, setConnected);
    return () => { off(); window.clearTimeout(idleTimer.current); };
  }, [drain]);

  const changeMode = (m: "guided" | "live") => {
    if (m === mode) return;
    tok.current++; draining.current = false; queue.current = [];
    resetDiagram(); setPhase("idle"); setError(null); setBusy(false);
    setMode(m);
  };

  /* ---------- derived ---------- */
  const shownIdx = selected ?? focusStation;
  const info = STATIONS[shownIdx];
  const statusText = useMemo(() => {
    switch (phase) {
      case "idle": return mode === "guided" ? "Preview. Send a sample report to run it for real." : "Preview. Waiting for live reports from anyone, try Simulate on the Ops screen.";
      case "sending": return "Report sent. New issues wake the AI agents, so this can take a few seconds…";
      case "playing": return "Following your report through the pipeline";
      case "await_work": return `Ticket ${ticket?.id ?? ""} is waiting for a crew`;
      case "await_fix": return "Crew is on site";
      case "done": return "Fixed and closed. The loop is complete.";
      case "merged": return `Merged into ${ticket?.id ?? "an existing ticket"}. No new ticket, no new crew.`;
      case "live": return "Following live events";
      case "error": return "That did not work";
    }
  }, [phase, mode, ticket]);

  const guidedActive = mode === "guided";
  const canSend = guidedActive && !busy && phase !== "sending" && phase !== "playing";

  return (
    <Page width="wide" theme="light">
      <div className="wf">
        <div className="wf-top">
          <div className="wf-title">
            <span className="t-eyebrow">Workflow</span>
            <h1 className="t-display">From report to resolved</h1>
            <p>Thousands of reports converge on one ticket, one crew, one fix. Watch a real report travel the line.</p>
          </div>
          <div className="wf-kpis" aria-label="Live totals">
            <div className="wf-kpi"><b className="t-num">{stats ? <AnimatedNumber value={stats.total_reports} /> : "–"}</b><span>Reports received</span></div>
            <div className="wf-kpi"><b className="t-num">{stats ? <AnimatedNumber value={stats.duplicates_absorbed} /> : "–"}</b><span>Duplicates merged</span></div>
            <div className="wf-kpi"><b className="t-num">{stats ? <AnimatedNumber value={stats.llm_calls_avoided} /> : "–"}</b><span>AI calls avoided</span></div>
          </div>
        </div>

        <div className="wf-bar">
          <SegmentedControl<"guided" | "live"> label="Mode" value={mode} onChange={changeMode}
            options={[{ value: "guided", label: "Guided", icon: <Hand size={16} strokeWidth={1.75} /> }, { value: "live", label: "Live", icon: <Radio size={16} strokeWidth={1.75} /> }]} />
          {guidedActive ? (
            <>
              <Button size="lg" icon={<Send />} loading={phase === "sending"} disabled={!canSend} onClick={send}>Send a sample report</Button>
              <SegmentedControl<Force> size="sm" label="Where" value={force} onChange={setForce}
                options={[{ value: "random", label: "Random" }, { value: "new", label: "New issue" }, { value: "dup", label: "Duplicate" }]} />
              <Button variant="secondary" icon={<Play />} disabled={busy || phase !== "await_work"} onClick={() => advance("work_in_progress")}>Crew starts work</Button>
              <Button variant="secondary" icon={<CircleCheck />} disabled={busy || (phase !== "await_fix" && phase !== "await_work")} onClick={() => advance("resolved")}>Mark fixed</Button>
              <Button variant="ghost" icon={<RotateCcw />} onClick={reset} disabled={phase === "idle"}>Reset</Button>
            </>
          ) : (
            <span className="wf-status">
              <span className={`wf-live-dot ${connected ? "" : "off"}`} />
              <b>{connected ? "Connected to the event stream" : "Reconnecting to the event stream…"}</b>
            </span>
          )}
          <span className="grow" />
          <span className="wf-status" role="status" aria-live="polite">{error ? <span className="wf-err">{error}</span> : statusText}</span>
        </div>

        <div className="wf-stage">
          
          <div className="wf-scroll">
            <svg className="wf-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Swimlane diagram of how a report becomes a fixed ticket">
              {LANES.map((l, i) => {
                const Icon = l.icon;
                return (
                  <g key={l.name} transform={`translate(0 ${i * LANE_H})`}>
                    <rect className={`wf-lane-band l${i}`} x={0} y={0} width={W} height={LANE_H} />
                    {i > 0 && <line className="wf-lane-line" x1={0} x2={W} y1={0} y2={0} />}
                    <foreignObject x={24} y={40 - 22} width={30} height={44}>
                      <div style={{ color: "var(--primary-text)", display: "grid", placeItems: "center", height: 44 }}><Icon size={22} strokeWidth={1.75} /></div>
                    </foreignObject>
                    <text className="wf-lane-name" x={62} y={40 - 2}>{l.name}</text>
                    <text className="wf-lane-sub" x={62} y={40 + 16}>{l.sub}</text>
                  </g>
                );
              })}
              <defs>
                <pattern id="wf-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.2" className="wf-dot" /></pattern>
              </defs>
              <rect x={LABEL_W} y={0} width={W - LABEL_W} height={H} fill="url(#wf-dots)" pointerEvents="none" />
              <line className="wf-lane-line" x1={LABEL_W} x2={LABEL_W} y1={0} y2={H} />

              {ROUTES.map((r) => (
                <g key={r.key}>
                  <path className={`wf-route-base ${r.branch ? "branch" : ""}`} d={pathD(r.pts)} />
                  <motion.path
                    className={`wf-route-lit ${r.branch ? "branch" : ""}`} d={pathD(r.pts)}
                    initial={false}
                    animate={{ pathLength: lit[r.key] ? 1 : 0, opacity: lit[r.key] ? 1 : 0 }}
                    transition={reduced ? { duration: 0 } : { duration: 0.6, ease: "easeInOut" }}
                  />
                  {r.label && <text className="wf-route-label" x={r.lx} y={r.ly} textAnchor="middle">{r.label}</text>}
                </g>
              ))}

              {STATIONS.map((s, i) => {
                const st = states[i]; const o = outs[i]; const Icon = s.icon;
                const x = sx(i), y = sy(i);
                const lines = s.label.length;
                return (
                  <g
                    key={s.n} role="button" tabIndex={0} aria-label={`Station ${s.n}: ${s.title}${o ? `, ${o.t}` : ""}`}
                    className={`wf-node is-${st} ${selected === i ? "is-selected" : ""}`}
                    transform={`translate(${x} ${y})`}
                    onClick={() => setSelected((v) => (v === i ? null : i))}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected((v) => (v === i ? null : i)); } }}
                  >
                    {st === "active" && !reduced && (
                      <motion.circle className="wf-node-glow" r={R} initial={{ opacity: 0.35, scale: 1 }}
                        animate={{ opacity: [0.35, 0, 0.35], scale: [1, 1.9, 1] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }} />
                    )}
                    {st === "active" && reduced && <circle className="wf-node-glow" r={R + 8} opacity={0.25} />}
                    <circle className="wf-node-sel" r={R + 8} />
                    <motion.circle className="wf-node-body" r={R} animate={{ scale: st === "active" ? 1.12 : 1 }} transition={spring.pop} />
                    <foreignObject x={-12} y={-12} width={24} height={24} style={{ pointerEvents: "none" }}>
                      <div className="wf-node-icon" style={{ display: "grid", placeItems: "center", width: 24, height: 24 }}><Icon size={22} strokeWidth={1.75} /></div>
                    </foreignObject>
                    <g transform={`translate(${-R + 2} ${-R + 2})`}>
                      <circle className="wf-num-bg" r={11} />
                      <text className="wf-num-t" textAnchor="middle" dy="4">{s.n}</text>
                    </g>
                    {s.label.map((t, k) => <text key={k} className={`wf-label ${i === 9 ? "halo" : ""}`} y={48 + k * 16}>{t}</text>)}
                    {o && (
                      <motion.g key={o.t} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}>
                        <text className={`wf-out ${i === 9 ? "halo" : ""} ${o.tone ?? ""}`} y={48 + lines * 16 + 2}>{o.t}</text>
                      </motion.g>
                    )}
                  </g>
                );
              })}

              {packetOn && (
                <motion.g style={{ x: px, y: py }} pointerEvents="none">
                  <motion.circle className="wf-packet-halo" r={20} animate={reduced ? undefined : { scale: [1, 1.5, 1] }} transition={{ duration: 1.2, repeat: Infinity }} />
                  <circle className="wf-packet" r={8} />
                </motion.g>
              )}
            </svg>
          </div>
          <div className="wf-legend">
            <span><i className="wf-key" /> Waiting</span>
            <span><i className="wf-key active" /> Active</span>
            <span><i className="wf-key done" /> Done</span>
            <span><i className="wf-key skipped" /> Skipped</span>
            <span><i className="wf-key warn" /> Edge miss or error</span>
            <span><i className="wf-keyline" /> Main route</span>
            <span><i className="wf-keyline dash" /> Shortcut branch</span>
            <span className="sp" />
            <span>Click any station to see what happens there</span>
          </div>
        </div>

        <div className="wf-lower">
          <section className="wf-card" aria-label="Run log">
            <div className="wf-card-head">
              <h2 className="t-title">Run log</h2>
              <Pill variant="neutral" size="sm" mono>{log.length} {log.length === 1 ? "event" : "events"}</Pill>
            </div>
            {log.length === 0 ? (
              <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>
                {guidedActive ? "Nothing yet. Send a sample report and every step lands here with its timing." : "Waiting for the first live event."}
              </p>
            ) : (
              <ul className="wf-log">
                {log.map((l) => (
                  <motion.li key={l.id} initial={reduced ? false : { opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={spring.soft}>
                    <time>{stamp(l.ts)}</time><i className={l.tone ?? ""} /><span>{l.text}</span>
                  </motion.li>
                ))}
              </ul>
            )}
          </section>

          <section className="wf-card wf-info" aria-label="Station details" aria-live="polite">
            <div className="wf-info-head">
              <div className="wf-info-icon"><info.icon size={22} strokeWidth={1.75} /></div>
              <div>
                <div className="t-eyebrow">Station {info.n} of 10 · {LANES[info.lane].name}</div>
                <h2 className="t-title" style={{ margin: 0 }}>{info.title}</h2>
              </div>
            </div>
            <div className="tech"><Pill variant="primary" icon={<Cpu size={14} />}>{info.tech}</Pill></div>
            <p>{info.what}</p>
            {outs[shownIdx] && <div className="wf-chips"><span className="wf-chip">Output <b>{outs[shownIdx]!.t}</b></span></div>}
            {shownIdx === 4 && cluster && (
              <>
                <div className="wf-chips" style={{ marginTop: 12 }}>
                  <span className="wf-chip">severity <b>{cluster.severity}/5</b></span>
                  <span className="wf-chip">reporters <b>{cluster.reporter_count}</b></span>
                  <span className="wf-chip">hazard <b>{cluster.is_hazard ? "yes" : "no"}</b></span>
                  <span className="wf-chip">location <b>{cluster.location_crit.toFixed(1)}</b></span>
                  <span className="wf-chip">bucket <b>{cluster.bucket}</b></span>
                </div>
                <div className="wf-formula">P = 100 × (0.30·severity + 0.25·reporters + 0.15·hazard + 0.15·location + 0.10·age)</div>
              </>
            )}
            {shownIdx === 5 && ticket && (
              <div className="wf-chips" style={{ marginTop: 4 }}>
                <span className="wf-chip">{ticket.id}</span><span className="wf-chip">severity <b>{ticket.severity}</b></span><span className="wf-chip">stage <b>{ticket.stage}</b></span>
              </div>
            )}
            {selected !== null && <p style={{ margin: "12px 0 0", fontSize: 12 }}>Pinned. Click the station again to follow the packet.</p>}
            {result && shownIdx === 0 && <div className="wf-chips" style={{ marginTop: 4 }}><span className="wf-chip">outcome <b>{result.outcome}</b></span><span className="wf-chip">neighbors <b>{result.neighbors}</b></span></div>}
          </section>
        </div>

        <div className="wf-sponsors">
          <span className="lbl">Powered by Akamai Cloud AI</span>
          <span className="wf-sp"><Zap size={18} strokeWidth={1.75} /> Akamai <small>EdgeKV cache, AI inference</small></span>
          <span className="wf-sp"><Sparkles size={18} strokeWidth={1.75} /> Strands Agents <small>judge and rationale</small></span>
          <span className="wf-sp"><TicketIcon size={18} strokeWidth={1.75} /> DevRev <small>ticket board shape</small></span>
          <span className="wf-sp"><Database size={18} strokeWidth={1.75} /> Civic Flow engine <small>dedup and priority</small></span>
        </div>
      </div>
    </Page>
  );
}
