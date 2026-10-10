import type {
  Cluster, ClusterDetail, CivicEvent, Flags, Health, Impact, LeaderboardEntry, NearbyResult,
  Profile, ReportResult, SimulateRequest, Stats, Ticket, TicketStage, VendorOrder, Category,
} from "@contracts";
import { mockApi } from "../mock";

export interface ReportInput {
  lat: number; lng: number; accuracy_m: number; category: Category; note: string; severity?: number;
  photo?: Blob | null;
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

export const userId = (): string => {
  try { return localStorage.getItem("cf_user") || "u_you"; } catch { return "u_you"; }
};

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-User-Id", userId());
  if (init.body && typeof init.body === "string") headers.set("Content-Type", "application/json");
  const res = await fetch(path, { ...init, headers });
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
    f.set("category", r.category); f.set("note", r.note);
    if (r.severity) f.set("severity", String(r.severity));
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
      es = new EventSource(`/api/events${lastId ? `?since=${lastId}` : ""}`);
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
