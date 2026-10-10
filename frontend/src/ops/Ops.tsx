import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity, ArrowRight, CheckCircle2, Cpu, Gauge, Inbox, Layers, MapPin, Play, Plus, RotateCcw, Radio,
  Route as RouteIcon, BarChart3, Workflow, ScanLine, GitMerge, Scale, Send, Sparkles, Ticket as TicketIcon, Users, Wrench, X, Zap, Clock, FileText,
} from "lucide-react";
import type { AgentStep, CivicEvent, Cluster, Health, Stats } from "@contracts";
import { api, MOCK } from "../lib/api";
import { catLabel } from "../lib/const";
import { useAsync, useEvents } from "../lib/hooks";
import {
  AnimatedNumber, Button, Card, EmptyState, ErrorState, IconButton, Pill, PriorityBadge, ProgressBar,
  Skeleton, StatusBadge, TicketId, spring,
} from "../components/ui";
import { Page } from "../components/shell/Page";
import OpsMap, { ZONE_COL, type GeoFlags, type OpsMapHandle } from "./OpsMap";
import { GeoChips, districtOf, useGeofenceLayers, zonesOf } from "./geo";
import AnalyticsPanel from "./Analytics";
import { CAT_ICON, Photo, cleanAddress, fmtClock } from "./util";
import { DevRevChip, DevRevCtx, WorkOrdersPanel, useDevRev, type DevRevEvent } from "./devrev";
import { useDevRevTicket } from "./devrev";
import { pinFresh } from "../lib/fresh";
import "./ops.css";

const NODES: AgentStep["node"][] = ["intake", "dedup", "judge", "priority", "dispatch"];
const NODE_META: Record<AgentStep["node"], { label: string; icon: typeof Inbox }> = {
  intake: { label: "Intake", icon: ScanLine }, dedup: { label: "Dedup", icon: GitMerge }, judge: { label: "Judge", icon: Scale },
  priority: { label: "Priority", icon: Gauge }, dispatch: { label: "Dispatch", icon: Send },
};
const ZERO: Stats = { total_reports: 0, unique_clusters: 0, duplicates_absorbed: 0, llm_calls_avoided: 0, open_clusters: 0, fixed_clusters: 0, tickets: 0, edge_hits: 0, edge_misses: 0, avg_edge_ms: 0 };
/** Storm presets: a believable flood of reports of one kind (or several), simulated without AI calls. */
interface StormLeg { category: Cluster["category"]; count: number; lat: number; lng: number; spread_m: number; users: number; rate_per_s: number }
interface Storm { key: string; label: string; title: string; zoom: number; center: { lat: number; lng: number }; legs: StormLeg[] }
const PLAZA = { lat: 39.042, lng: -94.595 };
const MIDTOWN = { lat: 39.06, lng: -94.59 };
const BRUSH_CREEK = { lat: 39.0388, lng: -94.5952 };
const CENTRAL = { lat: 39.055, lng: -94.585 };
const STORMS: Storm[] = [
  { key: "potholes", label: "Potholes", title: "Pothole storm at the Plaza", zoom: 13.2, center: PLAZA,
    legs: [{ category: "pothole", count: 1243, lat: PLAZA.lat, lng: PLAZA.lng, spread_m: 50, users: 400, rate_per_s: 80 }] },
  { key: "streetlights", label: "Streetlights", title: "Streetlight outages after a storm", zoom: 12.4, center: MIDTOWN,
    legs: [{ category: "streetlight_out", count: 600, lat: MIDTOWN.lat, lng: MIDTOWN.lng, spread_m: 1800, users: 300, rate_per_s: 80 }] },
  { key: "flooding", label: "Flooding", title: "Brush Creek flash flood", zoom: 13.2, center: BRUSH_CREEK,
    legs: [{ category: "flooding", count: 500, lat: BRUSH_CREEK.lat, lng: BRUSH_CREEK.lng, spread_m: 450, users: 250, rate_per_s: 70 }] },
  { key: "mixed", label: "Mixed", title: "A rough night across the city", zoom: 11.8, center: CENTRAL,
    legs: [
      { category: "pothole", count: 300, lat: PLAZA.lat, lng: PLAZA.lng, spread_m: 90, users: 150, rate_per_s: 90 },
      { category: "streetlight_out", count: 200, lat: CENTRAL.lat, lng: CENTRAL.lng, spread_m: 1500, users: 120, rate_per_s: 90 },
      { category: "flooding", count: 150, lat: BRUSH_CREEK.lat, lng: BRUSH_CREEK.lng, spread_m: 450, users: 90, rate_per_s: 90 },
      { category: "illegal_dumping", count: 80, lat: CENTRAL.lat, lng: CENTRAL.lng, spread_m: 1500, users: 50, rate_per_s: 90 },
      { category: "graffiti", count: 60, lat: CENTRAL.lat, lng: CENTRAL.lng, spread_m: 1500, users: 40, rate_per_s: 90 },
    ] },
];
const stormTotal = (st: Storm) => st.legs.reduce((n, l) => n + l.count, 0);

/* ---------------- feed ---------------- */
type FeedKind = "new" | "merge" | "fixed" | "assigned" | "ticket" | "info" | "devrev";
interface FeedItem { id: string; ts: string; kind: FeedKind; text: string; sub?: string; bucket?: string; refs?: string[]; tag?: string }
const FEED_ICON: Record<FeedKind, typeof Plus> = { new: Plus, merge: Users, fixed: CheckCircle2, assigned: Wrench, ticket: TicketIcon, info: Activity, devrev: Workflow };

function describe(e: CivicEvent): FeedItem | null {
  const d = e.data as any;
  const id = String(e.id);
  switch (e.type) {
    case "cluster.created": return { id, ts: e.ts, kind: "new", text: `New ${catLabel(d.cluster.category).toLowerCase()} near ${cleanAddress(d.cluster)}`, sub: `${d.cluster.bucket} priority`, bucket: d.cluster.bucket };
    case "cluster.merged": return { id, ts: e.ts, kind: "merge", text: `${d.cluster.reporter_count.toLocaleString()} neighbors now report ${cleanAddress(d.cluster)}`, sub: "Duplicate absorbed, no new ticket", bucket: d.cluster.bucket };
    case "cluster.updated": {
      const s = d.cluster.status as string;
      if (s === "fixed") return { id, ts: e.ts, kind: "fixed", text: `Fixed: ${catLabel(d.cluster.category).toLowerCase()} at ${cleanAddress(d.cluster)}`, sub: "Reporters notified" };
      return { id, ts: e.ts, kind: "assigned", text: s === "assigned" ? `Crew assigned at ${cleanAddress(d.cluster)}` : `Work started at ${cleanAddress(d.cluster)}`, sub: d.cluster.vendor ?? undefined, refs: [d.cluster.ticket_id].filter(Boolean) };
    }
    case "ticket.created": return { id, ts: e.ts, kind: "ticket", text: `Ticket ${d.ticket.id} opened`, sub: d.ticket.vendor ? `Routed to ${d.ticket.vendor}` : "In the queue", refs: [d.ticket.id] };
    case "ticket.updated": return { id, ts: e.ts, kind: "ticket", text: `${d.ticket.id} is ${String(d.ticket.stage).replace(/_/g, " ")}`, sub: d.ticket.vendor ?? undefined, refs: [d.ticket.id] };
    case "reset": return { id, ts: e.ts, kind: "info", text: "Demo reset, fresh city loaded" };
    default: return null;
  }
}
/** Seed the feed from clusters when the recent-event log has nothing readable. */
function synthFeed(cl: Cluster[]): FeedItem[] {
  return [...cl].sort((a, b) => +new Date(b.last_reported_at) - +new Date(a.last_reported_at)).slice(0, 6).map((c) => ({
    id: `s-${c.id}`, ts: c.last_reported_at, kind: c.reporter_count > 1 ? "merge" : "new" as FeedKind,
    text: c.reporter_count > 1 ? `${c.reporter_count.toLocaleString()} neighbors report ${cleanAddress(c)}` : `${catLabel(c.category)} reported near ${cleanAddress(c)}`,
    sub: c.ticket_id ? `Ticket ${c.ticket_id}${c.vendor ? ` - ${c.vendor}` : ""}` : undefined, bucket: c.bucket,
  }));
}

/** Merge DevRev events into the SSE-derived feed; drop SSE ticket/crew items that the same DevRev event already reports. */
function mergeFeed(feed: FeedItem[], ev: DevRevEvent[]): FeedItem[] {
  const dr: FeedItem[] = ev.map((e, i) => ({
    id: `dr-${e.ts}-${e.ticket_id}-${e.kind}-${i}`, ts: e.ts, kind: e.source === "DevRev" ? "devrev" : "ticket" as FeedKind,
    text: e.source === "DevRev" && e.devrev_id && !e.text.includes(e.devrev_id) ? `${e.devrev_id} ${e.text}` : e.text,
    sub: e.source === "DevRev" ? undefined : e.devrev_id ?? undefined, tag: e.source === "DevRev" ? "DevRev" : undefined,
    refs: [e.ticket_id],
  }));
  const near = (a: string, b: string) => Math.abs(+new Date(a) - +new Date(b)) < 20000;
  const kept = feed.filter((f) => !(f.refs?.length && (f.kind === "ticket" || f.kind === "assigned" || f.kind === "fixed") && dr.some((d) => d.refs?.some((r) => f.refs!.includes(r)) && near(d.ts, f.ts))));
  return [...dr, ...kept].sort((a, b) => (+new Date(b.ts) || 0) - (+new Date(a.ts) || 0)).slice(0, 14);
}

type Story = { storm: Storm; phase: "resetting" | "running" | "done"; baseUnique: number; baseReports: number; done: number; leg: number; before: number } | null;

export default function Ops() {
  const [clusters, setClusters] = useState<Map<string, Cluster>>(new Map());
  const [stats, setStats] = useState<Stats>(ZERO);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [lit, setLit] = useState<Partial<Record<AgentStep["node"], AgentStep & { at: number }>>>({});
  const [sim, setSim] = useState<{ done: number; total: number } | null>(null);
  const [story, setStory] = useState<Story>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const dr = useDevRev();
  const drRefresh = useRef(dr.refresh); drRefresh.current = dr.refresh;
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actErr, setActErr] = useState<string | null>(null);
  const [district, setDistrict] = useState("");
  const [flags, setFlags] = useState<GeoFlags>(() => {
    try { const j = JSON.parse(localStorage.getItem("cf_ops_layers") || ""); return { hoods: !!j.hoods, zones: !!j.zones, shade: !!j.shade }; } catch { return { hoods: true, zones: true, shade: true }; }
  });
  useEffect(() => { try { localStorage.setItem("cf_ops_layers", JSON.stringify(flags)); } catch { /* ignore */ } }, [flags]);
  const geo = useGeofenceLayers(flags.hoods || flags.zones);
  const pending =useRef(new Map<string, Cluster>());
  const pendingFeed = useRef<CivicEvent[]>([]);
  const litRef = useRef<Partial<Record<AgentStep["node"], AgentStep & { at: number }>>>({});
  const mapRef = useRef<OpsMapHandle>(null);
  const storyRef = useRef<Story>(null);
  storyRef.current = story;

  const load = useCallback(() => {
    return Promise.all([api.clusters({ limit: 500 }), api.stats(), api.recentEvents(200)])
      .then(([cl, st, ev]) => {
        setClusters(new Map(cl.map((c) => [c.id, c])));
        setStats(st);
        let items = ev.map(describe).filter((x): x is FeedItem => !!x).reverse().slice(0, 14);
        if (items.length < 4) items = [...items, ...synthFeed(cl)].slice(0, 14);
        setFeed(items);
        setLoadErr(null);
      })
      .catch((e) => setLoadErr(String(e.message ?? e)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const connected = useEvents((e) => {
    const d = e.data as any;
    if (e.type.startsWith("ticket.") || e.type === "cluster.updated") setTimeout(() => drRefresh.current(), 600);
    if (e.type === "reset") { pending.current.clear(); void load(); return; }
    if ((e.type === "cluster.created" || e.type === "cluster.merged" || e.type === "cluster.updated") && d.cluster) pending.current.set(d.cluster.id, d.cluster);
    if (e.type === "report.received" && typeof d.lat === "number") mapRef.current?.spawn(d.lat, d.lng);
    if (e.type === "stats.updated" && d.stats) setStats(d.stats);
    if (e.type === "simulate.progress") {
      const finished = d.done >= d.total;
      setSim(finished ? null : { done: d.done, total: d.total });
      const cur = storyRef.current;
      if (cur && cur.phase !== "resetting" && d.total === cur.storm.legs[cur.leg].count) {
        if (finished && cur.leg + 1 < cur.storm.legs.length) {
          const next = cur.leg + 1;
          const nxt = { ...cur, leg: next, before: cur.before + cur.storm.legs[cur.leg].count, done: 0, phase: "running" as const };
          storyRef.current = nxt;
          setStory(nxt);
          void api.simulate(cur.storm.legs[next]).catch((e) => setActErr(String((e as Error).message ?? e)));
        } else {
          setStory({ ...cur, done: d.done, phase: finished ? "done" : "running" });
        }
      }
    }
    if (e.type === "agent.node") litRef.current = { ...litRef.current, [d.node as AgentStep["node"]]: { ...(d as AgentStep), at: Date.now() } };
    else if (e.type !== "report.received" && e.type !== "stats.updated" && e.type !== "simulate.progress") pendingFeed.current.push(e);
  });

  // Batch updates so a simulation flood does not thrash React.
  useEffect(() => {
    const t = setInterval(() => {
      if (pending.current.size) {
        const batch = pending.current; pending.current = new Map();
        setClusters((m) => { const n = new Map(m); batch.forEach((c, id) => n.set(id, c)); return n; });
      }
      if (pendingFeed.current.length) {
        const evs = pendingFeed.current; pendingFeed.current = [];
        const items = evs.map(describe).filter((x): x is FeedItem => !!x);
        let out = items;
        if (items.length > 4) {
          const created = items.filter((i) => i.kind === "new").length;
          const merged = items.filter((i) => i.kind === "merge").length;
          out = [
            ...(created ? [items.filter((i) => i.kind === "new").slice(-1)[0]] : []),
            ...items.filter((i) => i.kind === "fixed" || i.kind === "assigned").slice(-1),
            { id: `sum-${evs[evs.length - 1].id}`, ts: evs[evs.length - 1].ts, kind: "merge" as FeedKind, text: `${items.length} updates: ${created} new, ${merged} merged into existing issues`, sub: "Flood collapsed by dedup" },
          ];
        }
        if (out.length) setFeed((l) => [...out.reverse(), ...l].slice(0, 14));
      }
      const now = Date.now();
      const l = litRef.current;
      const live = Object.entries(l).filter(([, v]) => now - (v as any).at < 1600);
      setLit((prev) => {
        const next = Object.fromEntries(live) as typeof l;
        const same = Object.keys(prev).length === live.length && live.every(([k, v]) => (prev as any)[k] === v);
        return same ? prev : next;
      });
    }, 250);
    return () => clearInterval(t);
  }, []);

  const allList = useMemo(() => [...clusters.values()], [clusters]);
  const districts = useMemo(() => [...new Set(allList.map(districtOf).filter((d): d is string => !!d))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [allList]);
  const list = useMemo(() => (district ? allList.filter((c) => districtOf(c) === district) : allList), [allList, district]);
  const queueView = useMemo(() => pinFresh(list.filter((c) => c.status !== "fixed").sort((a, b) => b.priority - a.priority), (c) => c.last_reported_at, (c) => c.id, (c) => c.simulated), [list]);
  const queue = useMemo(() => queueView.rows.slice(0, 30), [queueView]);
  const health = useAsync<Health>(() => api.health(), []);
  useEffect(() => { const t = setInterval(health.reload, 15000); return () => clearInterval(t); }, [health.reload]);

  async function reset() {
    setActErr(null);
    try { await api.reset(); setSelected(null); setStory(null); await load(); mapRef.current?.fit(); } catch (e) { setActErr(String((e as Error).message ?? e)); }
  }
  async function runStory(storm: Storm) {
    setActErr(null); setSelected(null);
    setStory({ storm, phase: "resetting", baseUnique: 0, baseReports: 0, done: 0, leg: 0, before: 0 });
    try {
      await api.reset();
      await load();
      const base = await api.stats();
      setStory({ storm, phase: "running", baseUnique: base.unique_clusters, baseReports: base.total_reports, done: 0, leg: 0, before: 0 });
      mapRef.current?.flyTo(storm.center.lat, storm.center.lng, storm.zoom);
      await api.simulate(storm.legs[0]);
      setSim({ done: 0, total: storm.legs[0].count });
    } catch (e) { setActErr(String((e as Error).message ?? e)); setStory(null); }
  }
  useEffect(() => { if (story?.phase === "done") { const t = setTimeout(() => mapRef.current?.fit(), 1200); return () => clearTimeout(t); } }, [story?.phase]);

  const shownFeed = useMemo(() => mergeFeed(feed, dr.events), [feed, dr.events]);
  const h = health.data;
  const sel = selected ? clusters.get(selected) ?? null : null;
  const busy = !!sim || story?.phase === "resetting" || story?.phase === "running";

  return (
    <DevRevCtx.Provider value={dr.byCluster}>
    <Page theme="light" width="full" fill bleed>
      <div className="ops-stage">
        <div className="ops-canvas">
          <OpsMap ref={mapRef} clusters={list} selected={selected} onSelect={setSelected} geo={geo} flags={flags} />
          <LayerControl flags={flags} onChange={setFlags} ready={!!geo} />

          <KpiBar stats={stats} loading={loading} busy={busy} sim={sim} story={story} onStory={runStory} onReset={reset} onAnalytics={() => setAnalyticsOpen(true)} onOrders={() => setOrdersOpen(true)} />
          <AnalyticsPanel open={analyticsOpen} onClose={() => setAnalyticsOpen(false)} />
          <WorkOrdersPanel open={ordersOpen} onClose={() => setOrdersOpen(false)} board={dr.board} onPick={(id) => setSelected(id)} />

          <div className="ops-left">
            <AnimatePresence>{story && <StoryCard story={story} stats={stats} onClose={() => setStory(null)} />}</AnimatePresence>
            <Feed feed={shownFeed} connected={connected} loading={loading} />
          </div>

          <Pipeline lit={lit} />

          <div className="ops-right">
            <AnimatePresence mode="wait" initial={false}>
              {sel ? (
                <Drawer key="drawer" cluster={sel} onClose={() => setSelected(null)} />
              ) : (
                <motion.div key="queue" className="ops-right__stack" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                  <Queue queue={queue} fresh={queueView.fresh} loading={loading} error={loadErr} retry={() => void load()} selected={selected} onSelect={setSelected} districts={districts} district={district} onDistrict={setDistrict} />
                  <Impact stats={stats} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {actErr && (
            <div className="ops-toast" role="alert"><ErrorState compact title="Action failed" message={actErr} onRetry={() => setActErr(null)} /></div>
          )}
        </div>

        <footer className="ops-foot">
          <span className="ops-foot__brand"><span className="ops-foot__mark" aria-hidden /><span>Powered by <b>Akamai Cloud AI</b> (hosted chat, embeddings, image)</span><span className="ops-foot__sep" />AWS Bedrock vision{h?.flags.agents_mode === "graph" ? " / Strands agents" : ""}</span>
          <span className="ops-foot__spacer" />
          {MOCK && <Pill variant="hazard" size="sm">Mock data</Pill>}
          {h ? (
            <span className="ops-foot__health" title={Object.entries(h.services).map(([k, v]) => `${k}: ${v}`).join("\n")}>
              <i className={`ops-dot ${h.status === "ok" ? "ok" : "bad"}`} />
              <span>API {h.status === "ok" ? "healthy" : h.status}</span>
              <span className="t-mono ops-foot__flags">{h.flags.agents_mode} / vision {h.flags.vision ? "on" : "off"} / geo cache {h.flags.edgekv_backend} / {h.flags.model_provider}</span>
            </span>
          ) : (
            <span className="ops-foot__health"><i className={`ops-dot ${health.error ? "bad" : ""}`} /><span>{health.error ? "API unreachable" : "Checking API"}</span></span>
          )}
        </footer>
      </div>
    </Page>
    </DevRevCtx.Provider>
  );
}

/* ---------------- KPI bar ---------------- */
function KpiBar({ stats, loading, busy, sim, story, onStory, onReset, onAnalytics, onOrders }: {
  stats: Stats; loading: boolean; busy: boolean; sim: { done: number; total: number } | null; story: Story;
  onStory: (s: Storm) => void; onReset: () => void; onAnalytics: () => void; onOrders: () => void;
}) {
  const items: { label: string; value: number; icon: typeof Inbox; dec?: number; suffix?: string; tone?: string; hint?: string }[] = [
    { label: "Reports", value: stats.total_reports, icon: Inbox },
    { label: "Unique issues", value: stats.unique_clusters, icon: MapPin, tone: "primary" },
    { label: "Dupes absorbed", value: stats.duplicates_absorbed, icon: Layers },
    { label: "Work orders avoided (est.)", value: stats.duplicates_absorbed, icon: Zap, hint: "Estimate: each duplicate report would otherwise have triggered its own dispatch or triage." },
    { label: "Tickets", value: stats.tickets, icon: TicketIcon },
    { label: "Geo cache", value: stats.avg_edge_ms, icon: Gauge, dec: 1, suffix: " ms" },
  ];
  return (
    <Card tone="glass" padding="none" className="ops-kpis" role="region" aria-label="Key numbers">
      <div className="ops-kpis__brand">
        <span className="ops-live"><i /> Live</span>
        <span className="t-title">City operations</span>
      </div>
      <div className="ops-kpis__grid">
        {items.map((k) => (
          <div key={k.label} className={`ops-kpi ${k.tone ? `is-${k.tone}` : ""}`} title={k.hint}>
            <div className="ops-kpi__label"><k.icon size={14} strokeWidth={1.75} aria-hidden />{k.label}</div>
            {loading ? <Skeleton width={72} height={28} /> : <AnimatedNumber value={k.value} decimals={k.dec} suffix={k.suffix} className="ops-kpi__value" />}
          </div>
        ))}
      </div>
      <div className="ops-kpis__actions">
        <div className="ops-storms" role="group" aria-label="Run the story: choose a storm">
          <span className="ops-storms__label"><Play size={12} strokeWidth={2} aria-hidden /> Run the story{sim ? ` (${sim.done}/${sim.total})` : ""}</span>
          <div className="ops-storms__seg">
            {STORMS.map((st) => (
              <button key={st.key} type="button" className={`ops-storms__btn ${story?.storm.key === st.key ? "is-on" : ""}`} onClick={() => onStory(st)} disabled={busy}
                title={`Reset the city, then simulate ${stormTotal(st).toLocaleString()} reports: ${st.title}. No AI calls.`}>{st.label}</button>
            ))}
          </div>
        </div>
        <Button variant="secondary" size="sm" icon={<Workflow />} onClick={onOrders}>Work orders</Button>
        <Button variant="secondary" size="sm" icon={<BarChart3 />} onClick={onAnalytics}>Analytics</Button>
        <Tip label="Reset the demo"><IconButton variant="ghost" icon={<RotateCcw />} label="Reset demo" onClick={onReset} disabled={busy} /></Tip>
      </div>
    </Card>
  );
}
function Tip({ children }: { label: string; children: React.ReactNode }) { return <>{children}</>; }

/* ---------------- story ---------------- */
function StoryCard({ story, stats, onClose }: { story: NonNullable<Story>; stats: Stats; onClose: () => void }) {
  const resetting = story.phase === "resetting";
  const total = stormTotal(story.storm);
  const reports = resetting ? 0 : story.phase === "done" ? total : Math.min(total, Math.max(story.before + story.done, stats.total_reports - story.baseReports, 0));
  const issues = resetting ? 0 : Math.max(0, stats.unique_clusters - story.baseUnique);
  const absorbed = Math.max(0, reports - issues);
  return (
    <motion.div className="ops-story" initial={{ opacity: 0, y: -12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={spring.soft} role="status" aria-live="polite">
      <Card tone="glass" padding="md">
        <div className="ops-story__head">
          <span className="t-eyebrow">{story.phase === "resetting" ? "Resetting the city" : story.phase === "running" ? `${story.storm.title}, live` : "Collapsed by dedup"}</span>
          <IconButton variant="ghost" size="sm" icon={<X />} label="Dismiss" onClick={onClose} />
        </div>
        <div className="ops-story__nums">
          <div><AnimatedNumber value={reports} ms={500} className="ops-story__big" /><span className="ops-story__cap">reports</span></div>
          <ArrowRight className="ops-story__arrow" size={28} strokeWidth={1.75} aria-hidden />
          <div><AnimatedNumber value={issues} ms={500} className="ops-story__big is-accent" /><span className="ops-story__cap">{issues === 1 ? "issue" : "issues"}</span></div>
        </div>
        {story.phase !== "done" ? (
          <ProgressBar value={reports} max={total} height={4} label="Simulation progress" />
        ) : (
          <div className="ops-story__done">
            <span><b className="t-num">{absorbed.toLocaleString()}</b> duplicates absorbed</span>
            <span><b className="t-num">{issues}</b> tickets, one per issue</span>
          </div>
        )}
      </Card>
    </motion.div>
  );
}

/* ---------------- feed ---------------- */
function Feed({ feed, connected, loading }: { feed: FeedItem[]; connected: boolean; loading: boolean }) {
  return (
    <Card tone="glass" padding="none" className="ops-feed">
      <div className="ops-panel__head">
        <span className="t-title">Live feed</span>
        <span className={`ops-conn ${connected ? "on" : ""}`}><i />{connected ? "Streaming" : "Reconnecting"}</span>
      </div>
      <div className="ops-feed__list" aria-live="off">
        {loading && feed.length === 0 && <div className="ops-pad"><Skeleton n={3} h={36} /></div>}
        {!loading && feed.length === 0 && <EmptyState compact icon={<Activity />} title="Listening for events" description="New reports show up here as they land." />}
        <AnimatePresence initial={false}>
          {feed.slice(0, 5).map((f) => {
            const Icon = FEED_ICON[f.kind];
            return (
              <motion.div key={f.id} layout="position" className="ops-feed__row" initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={spring.soft}>
                <span className={`ops-feed__icon k-${f.kind}`}><Icon size={14} strokeWidth={2} aria-hidden /></span>
                <span className="ops-feed__text"><span>{f.tag && <em className="ops-feed__tag">{f.tag}</em>}{f.text}</span>{f.sub && <small>{f.sub}</small>}</span>
                <time className="t-mono">{fmtClock(f.ts)}</time>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </Card>
  );
}

/* ---------------- pipeline ---------------- */
function Pipeline({ lit }: { lit: Partial<Record<AgentStep["node"], AgentStep & { at: number }>> }) {
  return (
    <Card tone="glass" padding="none" className="ops-pipe" role="group" aria-label="Agent pipeline">
      <div className="ops-pipe__title"><RouteIcon size={16} strokeWidth={1.75} aria-hidden /><span className="t-eyebrow">Agent line</span></div>
      <div className="ops-pipe__line">
        {NODES.map((n, i) => {
          const s = lit[n];
          const on = !!s && s.status !== "skipped";
          const Meta = NODE_META[n];
          return (
            <div key={n} className="ops-pipe__cell">
              {i > 0 && <span className={`ops-conn-line ${lit[NODES[i - 1]] ? "is-on" : ""}`}><i /></span>}
              <motion.div className={`ops-station ${on ? "is-lit" : ""} ${s?.status === "skipped" ? "is-skipped" : ""} ${s?.status === "error" ? "is-error" : ""}`}
                animate={on ? { scale: [1, 1.07, 1] } : { scale: 1 }} transition={spring.pop} title={s?.summary}>
                <span className="ops-station__node"><Meta.icon size={18} strokeWidth={1.75} aria-hidden /></span>
                <span className="ops-station__label">{Meta.label}</span>
                <span className="ops-station__ms t-mono">{s ? (s.status === "skipped" ? "skipped" : `${Math.round(s.ms)} ms`) : "idle"}</span>
              </motion.div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ---------------- queue ---------------- */
function LayerControl({ flags, onChange, ready }: { flags: GeoFlags; onChange: (f: GeoFlags) => void; ready: boolean }) {
  const Toggle = ({ k, label }: { k: keyof GeoFlags; label: string }) => (
    <label className={`ops-layer__row ${flags[k] ? "is-on" : ""} ${k === "shade" ? "is-sub" : ""}`}>
      <input type="checkbox" checked={flags[k]} onChange={(e) => onChange({ ...flags, [k]: e.target.checked })} />
      <span className="ops-layer__box" aria-hidden />
      <span>{label}</span>
    </label>
  );
  return (
    <Card tone="glass" padding="none" className="ops-layer" role="group" aria-label="Map layers">
      <div className="ops-layer__title"><Layers size={14} strokeWidth={1.75} aria-hidden />Map layers</div>
      <Toggle k="hoods" label="Neighborhoods" />
      {flags.hoods && <Toggle k="shade" label="Shade by open issues" />}
      <Toggle k="zones" label="Priority zones" />
      {flags.zones && (
        <div className="ops-layer__legend">
          <span><i style={{ background: ZONE_COL.school }} />School</span>
          <span><i style={{ background: ZONE_COL.hospital }} />Hospital</span>
        </div>
      )}
      {(flags.hoods || flags.zones) && !ready && <div className="ops-layer__note">Boundaries not loaded yet</div>}
      {(flags.hoods || flags.zones) && ready && <div className="ops-layer__note">Boundaries: Kansas City open data</div>}
    </Card>
  );
}

function Queue({ queue, fresh, loading, error, retry, selected, onSelect, districts, district, onDistrict }: {
  queue: Cluster[]; fresh: Set<string>; loading: boolean; error: string | null; retry: () => void; selected: string | null; onSelect: (id: string) => void;
  districts: string[]; district: string; onDistrict: (d: string) => void;
}) {
  const drMap = useContext(DevRevCtx);
  return (
    <Card tone="glass" padding="none" className="ops-queue">
      <div className="ops-panel__head">
        <span className="t-title">Priority queue</span>
        <Pill variant="outline" size="sm">{queue.length} open</Pill>
      </div>
      {(districts.length > 0 || district) && (
        <div className="ops-queue__filter">
          <label htmlFor="ops-district">District</label>
          <select id="ops-district" value={district} onChange={(e) => onDistrict(e.target.value)} aria-label="Filter by council district">
            <option value="">All districts</option>
            {districts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      )}
      <div className="ops-queue__list">
        {loading && queue.length === 0 && <div className="ops-pad"><Skeleton n={5} h={64} /></div>}
        {error && <div className="ops-pad"><ErrorState compact message={error} onRetry={retry} /></div>}
        {!loading && !error && queue.length === 0 && <EmptyState compact icon={<CheckCircle2 />} title="All clear" description="No open issues right now." />}
        <AnimatePresence initial={false}>
          {queue.map((c, i) => (
            <motion.button
              key={c.id} layout="position" type="button" className={`ops-qrow ${selected === c.id ? "is-sel" : ""}`}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ ...spring.soft, delay: Math.min(i, 8) * 0.025 }}
              onClick={() => onSelect(c.id)} aria-label={`${catLabel(c.category)} at ${cleanAddress(c)}, ${c.bucket}, ${c.reporter_count} reporters`}
            >
              <Photo url={c.photo_url} category={c.category} className="ops-qrow__photo" />
              <span className="ops-qrow__body">
                <span className="ops-qrow__top"><b>{fresh.has(c.id) && <i className="ops-new">New</i>}{catLabel(c.category)}</b><PriorityBadge bucket={c.bucket} size="sm" /></span>
                <span className="ops-qrow__addr">{cleanAddress(c)}</span>
                {(c.neighborhood || districtOf(c) || zonesOf(c).length > 0) && <GeoChips c={c} max={1} className="ops-qrow__geo" />}
                <span className="ops-qrow__meta">
                  <span><Users size={13} strokeWidth={1.75} />{c.reporter_count.toLocaleString()}</span>
                  {c.ticket_id && <TicketId id={c.ticket_id} />}
                  <span className={`ops-qrow__status s-${c.status}`}><i />{c.status === "in_progress" ? "In progress" : c.status === "assigned" ? "Crew assigned" : "Reported"}</span>
                </span>
                {drMap.get(c.id)?.devrev_id && <span className="ops-qrow__dr"><DevRevChip t={drMap.get(c.id) ?? null} /></span>}
              </span>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    </Card>
  );
}

/* ---------------- impact ---------------- */
function Impact({ stats }: { stats: Stats }) {
  const impact = useAsync(() => api.impact(), []);
  const hours = Math.round(stats.duplicates_absorbed * 0.5);
  return (
    <Card tone="glass" padding="none" className="ops-impact">
      <div className="ops-panel__head"><span className="t-title">City impact</span><Pill variant="outline" size="sm">Estimates</Pill></div>
      <div className="ops-impact__body">
        {impact.loading && !impact.data && <Skeleton n={3} h={20} />}
        {impact.error && <ErrorState compact message={impact.error} onRetry={impact.reload} />}
        {impact.data && (
          <>
            <p className="ops-impact__head">{impact.data.headline}</p>
            {impact.data.facts.slice(0, 3).map((f) => (
              <div key={f.label} className="ops-impact__row" title={f.note}>
                <span>{f.label}</span>
                <b className="t-mono">{f.value}{f.estimate && <em>est.</em>}</b>
              </div>
            ))}
            <div className="ops-impact__save"><Clock size={14} strokeWidth={1.75} aria-hidden /><span>About <b className="t-num">{hours.toLocaleString()}</b> crew-hours saved by dedup (estimate)</span></div>
          </>
        )}
      </div>
    </Card>
  );
}

/* ---------------- detail drawer ---------------- */
function Drawer({ cluster: c, onClose }: { cluster: Cluster; onClose: () => void }) {
  const d = useAsync(() => api.cluster(c.id), [c.id, c.status, c.reporter_count]);
  const photo = c.photo_url ?? d.data?.reports.find((r) => r.photo_url)?.photo_url ?? null;
  const Icon = CAT_ICON[c.category];
  const dt = useDevRevTicket(c.id);
  return (
    <motion.aside className="ops-drawer" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 28 }} transition={spring.soft} role="dialog" aria-label="Issue detail">
      <Card tone="glass" padding="none" className="ops-drawer__card">
        <div className="ops-drawer__scroll">
          <div className="ops-drawer__hero">
            <Photo url={photo} category={c.category} className="ops-drawer__photo" rounded={false} />
            <IconButton className="ops-drawer__close" variant="glass" icon={<X />} label="Close detail" onClick={onClose} autoFocus />
            <div className="ops-drawer__badges"><PriorityBadge bucket={c.bucket} score={c.priority} solid /><StatusBadge status={c.status} /></div>
          </div>
          <div className="ops-drawer__main">
            <div className="ops-drawer__title"><Icon size={20} strokeWidth={1.75} aria-hidden /><h2 className="t-title">{catLabel(c.category)}</h2></div>
            <p className="ops-drawer__addr">{cleanAddress(c)}{c.neighborhood ? `, ${c.neighborhood}` : ""}</p>
            {(c.neighborhood || districtOf(c) || zonesOf(c).length > 0) && <GeoChips c={c} max={4} />}
            <div className="ops-drawer__meta">
              <div><AnimatedNumber value={c.reporter_count} className="ops-drawer__n" /><span>neighbors</span></div>
              <div><AnimatedNumber value={c.report_count} className="ops-drawer__n" /><span>reports</span></div>
              <div><b className="ops-drawer__n t-num">{c.severity}/5</b><span>severity</span></div>
            </div>
            <div className="ops-drawer__row">{c.ticket_id && <TicketId id={c.ticket_id} />}{c.vendor && <Pill variant="neutral" size="sm">{c.vendor}</Pill>}{c.is_hazard && <Pill variant="hazard" size="sm">Safety hazard</Pill>}</div>
            {dt?.devrev_id && <div className="ops-drawer__dr"><DevRevChip t={dt} link /></div>}
            <ProgressBar value={c.priority} tone={c.bucket} label="Priority score" />

            {c.rationale && (
              <section className="ops-drawer__sec">
                <h3><Sparkles size={14} strokeWidth={1.75} aria-hidden />Why this priority</h3>
                <p>{c.rationale}</p>
                {zonesOf(c).length > 0 && <p className="ops-drawer__zonenote">Location criticality raised by: {zonesOf(c).join("; ")}</p>}
              </section>
            )}
            {d.loading && !d.data && <Skeleton n={2} h={44} />}
            {d.error && <ErrorState compact message={d.error} onRetry={d.reload} />}
            {d.data && (
              <>
                <section className="ops-drawer__sec">
                  <h3><Cpu size={14} strokeWidth={1.75} aria-hidden />Agent trace</h3>
                  {d.data.agent_trace.length === 0 ? <p className="ops-muted">No trace recorded for this issue.</p> : (
                    <ol className="ops-route">
                      {d.data.agent_trace.map((s, i) => (
                        <li key={i}><i /><span><b>{s.node}</b>{s.summary}</span><em className="t-mono">{s.status === "skipped" ? "skipped" : `${Math.round(s.ms)} ms`}</em></li>
                      ))}
                    </ol>
                  )}
                </section>
                <section className="ops-drawer__sec">
                  <h3><FileText size={14} strokeWidth={1.75} aria-hidden />Timeline</h3>
                  <ol className="ops-route">
                    {d.data.timeline.map((t, i) => (
                      <li key={i}><i /><span><b>{t.label}</b>{t.detail}</span><em className="t-mono">{fmtClock(t.ts)}</em></li>
                    ))}
                  </ol>
                </section>
              </>
            )}
          </div>
        </div>
      </Card>
    </motion.aside>
  );
}
