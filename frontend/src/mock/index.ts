// In-browser fake backend (VITE_MOCK=1). Conforms to contracts/types.ts.
import type {
  AgentStep, Badge, Bucket, Category, CivicEvent, Cluster, ClusterDetail, EventType, Flags, Impact,
  LeaderboardEntry, Profile, Report, ReportResult, Stats, Ticket, TicketStage, VendorOrder,
} from "@contracts";
import type { Api, ReportInput } from "../lib/api";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const iso = (d = Date.now()) => new Date(d).toISOString();
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

const R_AUTO: Record<string, number> = {
  pothole: 15, streetlight_out: 20, traffic_signal: 60, sidewalk_damage: 20, manhole_cover: 10,
  road_debris: 20, graffiti: 25, illegal_dumping: 50, downed_tree: 75, flooding: 300, other: 25,
};
const VENDORS = ["KC Road Crew Co.", "BrightLine Lighting", "GreenLeaf Urban Services"];
const vendorFor = (c: string) =>
  ["streetlight_out", "traffic_signal"].includes(c) ? VENDORS[1]
    : ["downed_tree", "illegal_dumping", "graffiti", "flooding"].includes(c) ? VENDORS[2] : VENDORS[0];
const HOODS = ["Plaza", "Westport", "Crossroads", "River Market", "Brookside", "Waldo", "Midtown"];
const STREETS = ["Main St", "Broadway", "Troost Ave", "Grand Blvd", "Wornall Rd", "State Line Rd", "Southwest Trafficway", "Pennsylvania Ave", "McGee St", "Ward Pkwy"];
const LEVELS: [string, number][] = [["Resident", 0], ["Watcher", 250], ["Guardian", 1000], ["Champion", 3000], ["Civic Hero", 10000]];
const levelFor = (xp: number): [string, number] => {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (xp >= l[1]) cur = l;
  const next = LEVELS.find((l) => l[1] > xp);
  return [cur[0], next ? next[1] : cur[1]];
};

function bucketOf(p: number): Bucket { return p >= 80 ? "P1" : p >= 60 ? "P2" : p >= 35 ? "P3" : "P4"; }
function priorityOf(severity: number, reporters: number, hazard: boolean, crit: number, ageDays: number): number {
  const S = (severity - 1) / 4;
  const R = Math.min(1, Math.log10(1 + reporters) / Math.log10(1001));
  const A = Math.min(1, ageDays / 7);
  return Math.round(100 * Math.min(1, 0.3 * S + 0.25 * R + 0.15 * (hazard ? 1 : 0) + 0.15 * crit + 0.1 * A) * 10) / 10;
}
function dist(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000, p = Math.PI / 180;
  const dLat = (bLat - aLat) * p, dLng = (bLng - aLng) * p;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * p) * Math.cos(bLat * p) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// ---------- state ----------
let clusters: Cluster[] = [];
let tickets: Ticket[] = [];
let reports: Report[] = [];
let events: CivicEvent[] = [];
let mine = new Set<string>();
let evId = 0, cid = 100, tid = 1041;
let xp = 140, confirmations = 2, reportsMade = 1;
const traces = new Map<string, AgentStep[]>();
const timelines = new Map<string, { ts: string; label: string; detail: string }[]>();
const subs = new Set<(e: CivicEvent) => void>();
let counters = { total: 0, dup: 0, avoided: 0, edgeHits: 0, edgeMisses: 0, edgeMs: 0 };
let flags: Flags = {
  model_provider: "mock", agents_mode: "det", vision: false, devrev_mode: "mock",
  storage: "local", edgekv_backend: "memory", demo_mode: true,
};

function emit(type: EventType, data: Record<string, unknown>) {
  const e: CivicEvent = { id: ++evId, type, ts: iso(), data };
  events.push(e);
  if (events.length > 400) events = events.slice(-300);
  subs.forEach((f) => f(e));
}
function statsNow(): Stats {
  const fixed = clusters.filter((c) => c.status === "fixed").length;
  return {
    total_reports: counters.total, unique_clusters: clusters.length, duplicates_absorbed: counters.dup,
    llm_calls_avoided: counters.avoided, open_clusters: clusters.length - fixed, fixed_clusters: fixed,
    tickets: tickets.length, edge_hits: counters.edgeHits, edge_misses: counters.edgeMisses,
    avg_edge_ms: counters.edgeHits + counters.edgeMisses ? Math.round((counters.edgeMs / (counters.edgeHits + counters.edgeMisses)) * 10) / 10 : 9,
  };
}
const ticketSeverity = (b: Bucket) => ({ P1: "blocker", P2: "high", P3: "medium", P4: "low" } as const)[b];

function mkCluster(category: Category, lat: number, lng: number, reporters: number, severity: number, ageDays: number, opts: Partial<Cluster> = {}): Cluster {
  const hazard = severity >= 4;
  const crit = rnd() < 0.2 ? 1 : rnd() < 0.5 ? 0.6 : 0.2;
  const priority = priorityOf(severity, reporters, hazard, crit, ageDays);
  const id = `cl_${++cid}`;
  const c: Cluster = {
    id, category, lat, lng, status: "reported", severity, is_hazard: hazard,
    hazard_description: hazard ? "Hazard to vehicles and cyclists" : "",
    reporter_count: reporters, report_count: reporters + Math.floor(reporters / 4), priority, bucket: bucketOf(priority),
    rationale: `Severity ${severity}, ${reporters} unique reporters, ${hazard ? "safety hazard, " : ""}open ${Math.round(ageDays)} days.`,
    location_crit: crit, neighborhood: pick(HOODS), address: `${100 + Math.floor(rnd() * 3900)} ${pick(STREETS)}`,
    photo_url: null, ticket_id: null, vendor: vendorFor(category), simulated: true,
    first_reported_at: iso(Date.now() - ageDays * 864e5), last_reported_at: iso(Date.now() - rnd() * 3600e3), fixed_at: null,
    ...opts,
  };
  const t: Ticket = {
    id: `CF-${++tid}`, cluster_id: id, title: `${catTitle(category)} near ${c.address}`,
    body: c.rationale, severity: ticketSeverity(c.bucket), stage: "queued", vendor: c.vendor,
    tags: [category, c.bucket], created_at: c.first_reported_at, updated_at: c.last_reported_at,
  };
  c.ticket_id = t.id;
  tickets.unshift(t);
  clusters.push(c);
  timelines.set(id, [
    { ts: c.first_reported_at, label: "Reported", detail: "First report received" },
    { ts: c.first_reported_at, label: "Ticket created", detail: `${t.id} sent to ${c.vendor}` },
  ]);
  return c;
}
const catTitle = (c: string) => c.replace(/_/g, " ").replace(/^./, (s) => s.toUpperCase());

function seedAll() {
  seed = 7; clusters = []; tickets = []; reports = []; events = []; mine = new Set(); cid = 100; tid = 1041; evId = 0;
  xp = 140; confirmations = 2; reportsMade = 1;
  const cats: Category[] = ["pothole", "pothole", "pothole", "pothole", "pothole", "streetlight_out", "sidewalk_damage", "manhole_cover", "road_debris", "graffiti", "illegal_dumping", "downed_tree", "flooding", "traffic_signal"];
  for (let i = 0; i < 39; i++) {
    const cat = pick(cats);
    const lat = 39.0997 + (rnd() - 0.5) * 0.12, lng = -94.5786 + (rnd() - 0.5) * 0.16;
    const reporters = Math.max(1, Math.round(Math.pow(rnd(), 3) * 40));
    mkCluster(cat, lat, lng, reporters, 1 + Math.floor(rnd() * 5), rnd() * 12);
  }
  const hot = mkCluster("pothole", 39.042, -94.595, 211, 4, 3, {
    neighborhood: "Plaza", address: "4600 Wornall Rd", rationale: "211 unique reporters in 3 days. Severity 4 hazard near a busy arterial. One ticket covers all reports.",
    location_crit: 0.8, simulated: true,
  });
  hot.priority = 78.4; hot.bucket = "P2";
  tickets.find((t) => t.cluster_id === hot.id)!.severity = "high";
  // a few in progress / fixed
  clusters[2].status = "assigned"; clusters[5].status = "in_progress"; clusters[8].status = "fixed"; clusters[8].fixed_at = iso();
  tickets.find((t) => t.cluster_id === clusters[5].id)!.stage = "work_in_progress";
  tickets.find((t) => t.cluster_id === clusters[8].id)!.stage = "resolved";
  // user's own reports
  [clusters[2], clusters[5], hot].forEach((c) => mine.add(c.id));
  counters = { total: 1243, dup: 1243 - clusters.length, avoided: 1160, edgeHits: 880, edgeMisses: 140, edgeMs: 880 * 9 + 140 * 31 };
  traces.set(hot.id, [
    { node: "intake", status: "done", ms: 12, summary: "Validated pothole, severity 4", model: null },
    { node: "dedup", status: "done", ms: 9, summary: "Geo score 0.91 vs hotspot, auto-merge", model: null },
    { node: "priority", status: "done", ms: 410, summary: "Priority 78.4 (P2)", model: "mock" },
    { node: "dispatch", status: "done", ms: 38, summary: `Ticket CF-1042 to ${vendorFor("pothole")}`, model: null },
  ]);
}
seedAll();

const clusterStatusFromStage = (s: TicketStage) => (s === "queued" ? "assigned" : s === "work_in_progress" ? "in_progress" : s === "resolved" ? "fixed" : "reported") as Cluster["status"];

// ---------- reporting ----------
function edge(hit: boolean) {
  const ms = hit ? 6 + Math.round(rnd() * 8) : 24 + Math.round(rnd() * 20);
  counters.edgeHits += hit ? 1 : 0; counters.edgeMisses += hit ? 0 : 1; counters.edgeMs += ms;
  return { hit, ms, cell: "9yg" + Math.floor(rnd() * 99) };
}
function nearbyClusters(lat: number, lng: number, category: string, radius?: number): Cluster[] {
  return clusters
    .filter((c) => c.status !== "fixed" && (category === "any" || c.category === category))
    .map((c) => ({ c, d: dist(lat, lng, c.lat, c.lng) }))
    .filter((x) => x.d <= (radius ?? Math.max(40, (R_AUTO[category] ?? 25) * 2)))
    .sort((a, b) => a.d - b.d).map((x) => x.c);
}
function step(node: AgentStep["node"], ms: number, summary: string, model: string | null = null): AgentStep {
  return { node, status: "done", ms, summary, model };
}

async function doReport(r: { lat: number; lng: number; category: Category; note: string; severity?: number; accuracy_m: number }, kind: Report["kind"], forced?: Cluster, simulated = false): Promise<ReportResult> {
  counters.total++;
  const rid = `rp_${Date.now()}_${Math.floor(rnd() * 1e4)}`;
  emit("report.received", { report_id: rid, user_id: "u_you", lat: r.lat, lng: r.lng });
  const near = forced ?? nearbyClusters(r.lat, r.lng, r.category, (R_AUTO[r.category] ?? 25))[0];
  const e = edge(!!near);
  const steps: AgentStep[] = [step("intake", 8 + Math.round(rnd() * 8), `Validated ${r.category.replace(/_/g, " ")}`)];
  const emitStep = (s: AgentStep, cluster_id: string) => emit("agent.node", { ...s, report_id: rid, cluster_id });
  if (near) {
    const before = near.priority;
    near.reporter_count++; near.report_count++;
    near.severity = Math.max(near.severity, r.severity ?? 3);
    near.priority = Math.min(100, Math.round((near.priority + Math.max(0.4, 6 / Math.sqrt(near.reporter_count))) * 10) / 10);
    near.bucket = bucketOf(near.priority);
    near.last_reported_at = iso();
    counters.dup++; counters.avoided++;
    steps.push(step("dedup", 6, `Merged into ${near.id}, geo score 0.${86 + Math.floor(rnd() * 12)}`));
    steps.push(step("judge", 0, "Skipped: auto-merge, LLM call avoided"));
    steps[2].status = "skipped";
    steps.push(step("priority", 4, `Priority ${before.toFixed(1)} -> ${near.priority.toFixed(1)}`));
    steps.forEach((s) => emitStep(s, near.id));
    const pts = kind === "confirm" ? 5 : kind === "photo_confirm" ? 15 : 15;
    const tkt = tickets.find((t) => t.cluster_id === near.id) ?? null;
    if (!simulated) {
      mine.add(near.id); xp += pts; confirmations++;
      reports.push(mkReport(rid, near, r, kind));
      emit("cluster.merged", { cluster: near, outcome: "merged", points: pts });
    } else emit("cluster.merged", { cluster: near, outcome: "merged", points: 0 });
    emit("stats.updated", { stats: statsNow() });
    const [lvl] = levelFor(xp);
    return {
      outcome: "merged", message: `You + ${near.reporter_count - 1} neighbors reported this`, report_id: rid, cluster: near,
      neighbors: near.reporter_count - 1, points_awarded: simulated ? 0 : pts, xp_total: xp, level: lvl,
      priority_before: before, priority_after: near.priority, ticket: tkt, edge: e, steps,
    };
  }
  const sev = r.severity ?? 3;
  const c = mkCluster(r.category, r.lat, r.lng, 1, sev, 0, { simulated, neighborhood: pick(HOODS), address: `${Math.floor(rnd() * 900)} ${pick(STREETS)}` });
  counters.avoided += 0;
  steps.push(step("dedup", 7, "No open cluster nearby, creating new"));
  steps.push({ node: "judge", status: "skipped", ms: 0, summary: "Skipped: no candidates", model: null });
  steps.push(step("priority", 380, `Priority ${c.priority.toFixed(1)} (${c.bucket})`, "mock"));
  steps.push(step("dispatch", 41, `Ticket ${c.ticket_id} to ${c.vendor}`));
  steps.forEach((s) => emitStep(s, c.id));
  const tkt = tickets.find((t) => t.cluster_id === c.id) ?? null;
  if (!simulated) { mine.add(c.id); xp += 50; reportsMade++; reports.push(mkReport(rid, c, r, "first")); }
  traces.set(c.id, steps);
  emit("cluster.created", { cluster: c, outcome: "created", points: simulated ? 0 : 50 });
  if (tkt) emit("ticket.created", { ticket: tkt });
  emit("stats.updated", { stats: statsNow() });
  const [lvl] = levelFor(xp);
  return {
    outcome: "created", message: "You're the first responder", report_id: rid, cluster: c, neighbors: 0,
    points_awarded: simulated ? 0 : 50, xp_total: xp, level: lvl, priority_before: null, priority_after: c.priority,
    ticket: tkt, edge: e, steps,
  };
}
function mkReport(id: string, c: Cluster, r: { lat: number; lng: number; accuracy_m: number; category: Category; note: string }, kind: Report["kind"]): Report {
  return { id, cluster_id: c.id, user_id: "u_you", lat: r.lat, lng: r.lng, accuracy_m: r.accuracy_m, category: r.category, note: r.note, photo_url: null, phash: null, kind, simulated: false, created_at: iso() };
}

// ---------- ticking fake stream ----------
let ticker: number | undefined;
function startTicker() {
  if (ticker || typeof window === "undefined") return;
  ticker = window.setInterval(() => {
    if (!subs.size || !clusters.length) return;
    const open = clusters.filter((c) => c.status !== "fixed");
    if (!open.length) return;
    const c = pick(open);
    doReport({ lat: c.lat, lng: c.lng, category: c.category, note: "", accuracy_m: 12, severity: 3 }, "confirm", c, true);
  }, 4500);
}

const badges = (): Badge[] => [
  { id: "first", name: "First Responder", description: "Create a new issue", earned: reportsMade > 0 },
  { id: "hunter", name: "Pothole Hunter", description: "Report 5 potholes", earned: false },
  { id: "confirmer", name: "Confirmer", description: "Confirm 5 issues", earned: confirmations >= 5 },
  { id: "lamp", name: "Lamplighter", description: "Report a streetlight", earned: false },
  { id: "verify", name: "Fix Verifier", description: "Verify a fix", earned: false },
  { id: "storm", name: "Storm Watch", description: "Report flooding", earned: false },
  { id: "guardian", name: "Neighborhood Guardian", description: "Reach 1,000 XP", earned: xp >= 1000 },
  { id: "hero", name: "Civic Hero", description: "Reach 10,000 XP", earned: xp >= 10000 },
];

const IMPACT: Impact = {
  headline: "Duplicate reports burn crew hours and slow real repairs",
  facts: [
    { label: "Pothole 311 requests, KC 2025", value: "about 9,700", note: "KCMO open data", estimate: false, source: "data.kcmo.org d4px-6rwg" },
    { label: "Median days to close", value: "13 (90th percentile 51)", note: "Pothole requests", estimate: false, source: "data.kcmo.org d4px-6rwg" },
    { label: "Requests within 50 m and 30 days of an earlier one", value: "about 28%", note: "Spatio-temporal duplicate estimate, not an official rate", estimate: true, source: "data.kcmo.org d4px-6rwg" },
    { label: "Canceled pothole requests, 2025", value: "30%", note: "", estimate: false, source: "data.kcmo.org d4px-6rwg" },
    { label: "NYC potholes formally closed as duplicates", value: "8.8%", note: "", estimate: false, source: "NYC Open Data" },
    { label: "Average US pothole repair cost to drivers", value: "about $600", note: "", estimate: false, source: "AAA" },
    { label: "Extra yearly cost of poor roads, KC driver", value: "$704", note: "", estimate: false, source: "TRIP 2020" },
  ],
};

const LEADERS = ["Maya R.", "Dre T.", "Priya N.", "Luis G.", "Sam K.", "Jo W.", "Aisha B.", "Chen L.", "Tomas V.", "Nina F.", "Owen P.", "Rae S."];

let simTimer: number | undefined;
export const mockApi: Api = {
  async health() { await sleep(60); return { status: "ok", flags, services: { api: "ok", sqlite: "ok", edgekv: "memory", ai: "mock (browser)", valkey: "not configured" } }; },
  async nearby(lat, lng, category, radius) {
    await sleep(40);
    const list = nearbyClusters(lat, lng, category, radius);
    return { clusters: list, edge: edge(list.length > 0) };
  },
  async submitReport(r: ReportInput) { await sleep(500); return doReport(r, r.photo ? "first" : "first"); },
  async confirm(id, lat, lng, acc) {
    await sleep(250);
    const c = clusters.find((x) => x.id === id);
    if (!c) throw new Error("cluster not found");
    if (mine.has(id) && reports.some((x) => x.cluster_id === id)) {
      const [lvl] = levelFor(xp);
      return { outcome: "merged", message: "Already counted, thanks", cluster: c, neighbors: c.reporter_count - 1, points_awarded: 0, xp_total: xp, level: lvl, ticket: tickets.find((t) => t.cluster_id === id) ?? null, edge: edge(true), steps: [] };
    }
    return doReport({ lat, lng, category: c.category, note: "", accuracy_m: acc ?? 15 }, "confirm", c);
  },
  async clusters(q = {}) {
    await sleep(60);
    let l = [...clusters];
    if (q.status) l = l.filter((c) => c.status === q.status);
    if (q.min_priority) l = l.filter((c) => c.priority >= q.min_priority!);
    l.sort((a, b) => b.priority - a.priority);
    return q.limit ? l.slice(0, q.limit) : l;
  },
  async cluster(id): Promise<ClusterDetail> {
    await sleep(60);
    const cluster = clusters.find((c) => c.id === id);
    if (!cluster) throw new Error("cluster not found");
    return {
      cluster, ticket: tickets.find((t) => t.cluster_id === id) ?? null,
      reports: reports.filter((r) => r.cluster_id === id),
      timeline: timelines.get(id) ?? [], agent_trace: traces.get(id) ?? [],
    };
  },
  async me(): Promise<Profile> {
    const [level, next] = levelFor(xp);
    return { user_id: "u_you", name: "You", neighborhood: "Plaza", xp, level, next_level_xp: next, streak_weeks: 3, reports: reportsMade, confirmations, fixed: clusters.filter((c) => mine.has(c.id) && c.status === "fixed").length, badges: badges() };
  },
  async myReports() { await sleep(60); return clusters.filter((c) => mine.has(c.id)); },
  async leaderboard(): Promise<LeaderboardEntry[]> {
    const rows = LEADERS.map((n, i) => ({ name: n, xp: 2400 - i * 170, reports: 30 - i * 2, neighborhood: HOODS[i % HOODS.length], is_you: false }));
    rows.push({ name: "You", xp, reports: reportsMade, neighborhood: "Plaza", is_you: true });
    rows.sort((a, b) => b.xp - a.xp);
    return rows.map((r, i) => ({ rank: i + 1, ...r }));
  },
  async tickets() { return [...tickets]; },
  async advance(ticketId, stage) {
    const t = tickets.find((x) => x.id === ticketId);
    if (!t) throw new Error("ticket not found");
    t.stage = stage; t.updated_at = iso();
    const c = clusters.find((x) => x.id === t.cluster_id);
    if (c) { c.status = clusterStatusFromStage(stage); emit("cluster.updated", { cluster: c, outcome: "merged", points: 0 }); }
    emit("ticket.updated", { ticket: t });
    return t;
  },
  async vendorOrders(vendor) {
    await sleep(60);
    return clusters
      .filter((c) => c.status !== "fixed" && (!vendor || c.vendor === vendor))
      .sort((a, b) => b.priority - a.priority)
      .map((cluster): VendorOrder => ({ cluster, ticket: tickets.find((t) => t.cluster_id === cluster.id) ?? null, due: iso(Date.parse(cluster.first_reported_at) + (cluster.bucket === "P1" ? 2 : 7) * 864e5) }));
  },
  async fix(id) {
    await sleep(500);
    const c = clusters.find((x) => x.id === id);
    if (!c) throw new Error("cluster not found");
    c.status = "fixed"; c.fixed_at = iso();
    const t = tickets.find((x) => x.cluster_id === id);
    if (t) { t.stage = "resolved"; t.updated_at = iso(); emit("ticket.updated", { ticket: t }); }
    timelines.get(id)?.push({ ts: iso(), label: "Fixed", detail: "Crew marked the work complete" });
    if (mine.has(id)) xp += 100;
    emit("cluster.updated", { cluster: c, outcome: "merged", points: mine.has(id) ? 100 : 0 });
    emit("stats.updated", { stats: statsNow() });
    return c;
  },
  async stats() { return statsNow(); },
  async impact() { return IMPACT; },
  async recentEvents(limit = 50) { return events.slice(-limit); },
  async simulate(req) {
    window.clearInterval(simTimer);
    let done = 0;
    const gap = Math.max(40, 1000 / Math.max(1, req.rate_per_s));
    simTimer = window.setInterval(() => {
      done++;
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * req.spread_m;
      const lat = req.lat + (d * Math.cos(a)) / 111000, lng = req.lng + (d * Math.sin(a)) / (111000 * Math.cos(req.lat * Math.PI / 180));
      doReport({ lat, lng, category: req.category, note: "", accuracy_m: 10, severity: 1 + Math.floor(rnd() * 5) }, "first", undefined, true);
      emit("simulate.progress", { done, total: req.count });
      if (done >= req.count) window.clearInterval(simTimer);
    }, gap);
    return { started: true };
  },
  async reset() {
    window.clearInterval(simTimer);
    seedAll(); emit("reset", {});
    return { ok: true };
  },
  async flags(patch) { if (patch) flags = { ...flags, ...patch }; return flags; },
  subscribe(onEvent, onStatus) {
    subs.add(onEvent); onStatus?.(true); startTicker();
    return () => { subs.delete(onEvent); };
  },
};
