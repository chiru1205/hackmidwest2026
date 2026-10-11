import type {
  Cluster, ClusterDetail, CivicEvent, Flags, Health, Impact, LeaderboardEntry, NearbyResult,
  Profile, ReportResult, SimulateRequest, Stats, Ticket, TicketStage, VendorOrder, Category,
} from "@contracts";
import { mockApi } from "../mock";
import { ROLE, authHeaders, lockStaff, staffToken } from "./auth";

export interface ReportInput {
  lat: number; lng: number; accuracy_m: number; category?: Category; note: string; severity?: number;
  photo?: Blob | null;
  /** set when a demo preset / ?demo=1 is active so the server may accept out-of-area spots */
  demoOverride?: boolean;
}

export interface Api {
  health(): Promise<Health>;
  nearby(lat: number, lng: number, category: string, radius_m?: number): Promise<NearbyResult>;
  submitReport(r: ReportInput): Promise<ReportResult>;
  confirm(id: string, lat: number, lng: number, accuracy_m?: number): Promise<ReportResult>;
  clusters(q?: { status?: string; min_priority?: number; limit?: number }): Promise<Cluster[]>;
  cluster(id: string): Promise<ClusterDetail>;
  me(): Promise<Profile>;
  myReports(): Promise<Cluster[]>;
  leaderboard(): Promise<LeaderboardEntry[]>;
  tickets(): Promise<Ticket[]>;
  advance(ticketId: string, stage: TicketStage): Promise<Ticket>;
  vendorOrders(vendor?: string): Promise<VendorOrder[]>;
  fix(clusterId: string, photo?: Blob | null): Promise<Cluster>;
  stats(): Promise<Stats>;
  impact(): Promise<Impact>;
  recentEvents(limit?: number): Promise<CivicEvent[]>;
  simulate(req: SimulateRequest): Promise<{ started: boolean }>;
  reset(): Promise<{ ok: boolean }>;
  flags(patch?: Partial<Flags>): Promise<Flags>;
  /** Subscribe to the live event stream. Returns an unsubscribe function. */
  subscribe(onEvent: (e: CivicEvent) => void, onStatus?: (connected: boolean) => void): () => void;
}

export { userId } from "./auth";

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  Object.entries(authHeaders()).forEach(([k, v]) => headers.set(k, v));
  if (init.body && typeof init.body === "string") headers.set("Content-Type", "application/json");
  const res = await fetch(path, { ...init, headers });
  if (res.status === 403 && ROLE === "city") lockStaff();
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = await res.json();
      const d = j.detail ?? j.message;
      if (d) msg = typeof d === "string" ? d : JSON.stringify(d);
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}
const qs = (o: Record<string, unknown>) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => v !== undefined && v !== null && v !== "" && p.set(k, String(v)));
  const s = p.toString();
  return s ? `?${s}` : "";
};
const post = <T,>(path: string, body?: unknown) =>
  req<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

const realApi: Api = {
  health: () => req("/api/health"),
  nearby: (lat, lng, category, radius_m) => req(`/api/nearby${qs({ lat, lng, category, radius_m })}`),
  submitReport: (r) => {
    const f = new FormData();
    f.set("lat", String(r.lat)); f.set("lng", String(r.lng)); f.set("accuracy_m", String(r.accuracy_m));
    if (r.category) f.set("category", r.category);
    f.set("note", r.note);
    if (r.severity) f.set("severity", String(r.severity));
    if (r.demoOverride) f.set("demo_override", "1");
    if (r.photo) f.set("photo", r.photo, "photo.jpg");
    return req("/api/reports", { method: "POST", body: f });
  },
  confirm: (id, lat, lng, accuracy_m) => post(`/api/clusters/${id}/confirm`, { lat, lng, accuracy_m }),
  clusters: (q = {}) => req(`/api/clusters${qs(q)}`),
  cluster: (id) => req(`/api/clusters/${id}`),
  me: () => req("/api/me"),
  myReports: () => req("/api/me/reports"),
  leaderboard: () => req("/api/leaderboard"),
  tickets: () => req("/api/tickets"),
  advance: (id, stage) => post(`/api/tickets/${id}/advance`, { stage }),
  vendorOrders: (vendor) => req(`/api/vendor/orders${qs({ vendor })}`),
  fix: (id, photo) => {
    const f = new FormData();
    if (photo) f.set("photo", photo, "after.jpg");
    return req(`/api/vendor/orders/${id}/fix`, { method: "POST", body: f });
  },
  stats: () => req("/api/stats"),
  impact: () => req("/api/impact"),
  recentEvents: (limit = 50) => req(`/api/events/recent${qs({ limit })}`),
  simulate: (r) => post("/api/admin/simulate", r),
  reset: () => post("/api/admin/reset"),
  flags: (patch) => (patch ? post("/api/admin/flags", patch) : req("/api/admin/flags")),
  subscribe(onEvent, onStatus) {
    let es: EventSource | null = null;
    let lastId = 0;
    let closed = false;
    let timer: number | undefined;
    const open = () => {
      if (closed) return;
      es = new EventSource(`/api/events${qs({ since: lastId || undefined, token: staffToken() ?? undefined })}`);
      es.onopen = () => onStatus?.(true);
      es.onmessage = (m) => {
        try {
          const e = JSON.parse(m.data) as CivicEvent;
          if (typeof e.id === "number") {
            if (e.id <= lastId) return;
            lastId = e.id;
          }
          onEvent(e);
        } catch { /* ignore malformed */ }
      };
      es.onerror = () => {
        onStatus?.(false);
        es?.close();
        timer = window.setTimeout(open, 2000);
      };
    };
    open();
    return () => { closed = true; es?.close(); window.clearTimeout(timer); };
  },
};

export const MOCK = import.meta.env.VITE_MOCK === "1" || import.meta.env.VITE_MOCK === "true";
export const api: Api = MOCK ? mockApi : realApi;

/* ---- Ops analytics (DevRev work orders, Civic Flow app metrics) ---- */
export interface WorkOrderStats {
  source: "devrev" | "local board"; as_of: string; total: number;
  by_stage: { queued: number; work_in_progress: number; resolved: number; other: number };
  open_backlog: { blocker: number; high: number; medium: number; low: number }; open_total: number;
  resolved: number; resolved_timed: number;
  median_ttr_s: number | null; median_ttr: string | null; p90_ttr_s: number | null; p90_ttr: string | null;
  oldest_open_s: number | null; oldest_open: string | null; created_last_hour: number;
  vendors: { vendor: string; total: number; open: number; resolved: number }[];
}
export interface AppMetrics {
  source: string; total_reports: number; unique_issues: number; duplicates_absorbed: number; dedup_ratio: number;
  llm_calls_avoided: number; geo_cache_hit_rate: number | null; geo_cache_lookups: number; geo_cache_avg_ms: number;
  vision_reports: number | null; ai_usage: { label: string; calls: number; avg_ms: number; errors: number }[];
}
export const fetchWorkOrderStats = () => req<WorkOrderStats>("/api/analytics/work-orders");
export const fetchAppMetrics = () => req<AppMetrics>("/api/analytics/app");

export interface GeoZone { type: "school" | "hospital" | "arterial"; name: string; distance_m: number; radius_m: number; boost: number }
export interface GeofenceInfo {
  in_service_area: boolean; neighborhood: string | null; district: string | null; zones: GeoZone[]; message: string | null;
}
/** Geofence lookup; resolves null when the endpoint is missing or fails (the UI then shows nothing). */
export const fetchGeofence = (lat: number, lng: number): Promise<GeofenceInfo | null> =>
  req<GeofenceInfo>(`/api/geofence${qs({ lat: lat.toFixed(6), lng: lng.toFixed(6) })}`).catch(() => null);

/* ---- Geofence layers (real neighborhood polygons + priority zones) ---- */
export interface GeoZone { type: "school" | "hospital" | "arterial"; name: string; lat: number; lng: number; radius_m: number }
export interface GeofenceLayers {
  neighborhoods: { type: "FeatureCollection"; features: { type: "Feature"; properties: { name: string; district?: string | null }; geometry: unknown }[] };
  zones: GeoZone[];
}
export const fetchGeofenceLayers = () => req<GeofenceLayers>("/api/geofence/layers");

/* ---- DevRev case-flow board (Workflow page) ---- */
export type CfStageKey = "queued" | "assigned" | "in_progress" | "awaiting_verification" | "resolved";
export interface BoardTicket {
  id: string; devrev_id: string | null; title: string; cluster_id: string; stage_key: CfStageKey;
  severity: "blocker" | "high" | "medium" | "low"; priority_bucket: "P1" | "P2" | "P3" | "P4";
  vendor: string | null; owner: string | null; neighborhood: string | null; district: string | null;
  zones: string[]; reporters: number; age_s: number; due: string | null; overdue: boolean;
  escalated: boolean; evidence_count: number; web_url: string | null;
}
export interface BoardStage { key: CfStageKey; label: string; count: number; avg_age_s: number | null; tickets: BoardTicket[] }
export interface DevrevBoard {
  source: "devrev" | "local board"; as_of: string; stages: BoardStage[];
  totals: { open: number; overdue: number; escalated: number; resolved: number; median_ttr: string | null };
}
export interface JourneyStep {
  ts: string; source: "civicflow" | "devrev";
  kind: "report" | "vision" | "geofence" | "dedup" | "priority" | "routing" | "created" | "stage" | "comment" | "escalated" | "verification" | "resolved" | "reopened";
  title: string; detail: string;
}
export interface DevrevJourney { ticket: BoardTicket; steps: JourneyStep[] }
export type DevrevActionName = "start" | "request_verification" | "approve" | "escalate" | "reopen";
export interface DevrevActionResult { ok: boolean; ticket: BoardTicket | null; error: string | null }
export interface DevrevEvent {
  ts: string; kind: "created" | "stage" | "comment" | "escalated" | "verification" | "resolved" | "reopened";
  ticket_id: string; devrev_id: string | null; text: string; source: "DevRev" | "Civic Flow";
}
export const devrevBoard = () => req<DevrevBoard>("/api/devrev/board");
export const devrevJourney = (id: string) => req<DevrevJourney>(`/api/devrev/ticket/${encodeURIComponent(id)}/journey`);
export const devrevAction = (id: string, action: DevrevActionName, note?: string | null) =>
  post<DevrevActionResult>(`/api/devrev/ticket/${encodeURIComponent(id)}/action`, { action, note: note ?? null });
export const devrevEvents = (limit = 30) => req<DevrevEvent[]>(`/api/devrev/events${qs({ limit })}`);

/* ---- Workflow page "case journey" (rail + one case at a time) ---- */
export type {
  CaseAction, CaseCounts, CaseDetail, CaseList, CaseReason, CaseRow, DevrevRecord, FactorBar, Station,
} from "@contracts";
export interface CaseListParams { group?: "needs" | "approval" | "overdue" | "escalated" | "no_crew" | "all"; q?: string; district?: string; limit?: number; offset?: number }
export const devrevCases = (params: CaseListParams = {}, signal?: AbortSignal) =>
  req<import("@contracts").CaseList>(`/api/devrev/cases${qs({ ...params })}`, { signal });
export const devrevCase = (id: string, signal?: AbortSignal) =>
  req<import("@contracts").CaseDetail>(`/api/devrev/ticket/${encodeURIComponent(id)}/case`, { signal });
