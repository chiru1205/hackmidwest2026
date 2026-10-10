/** Client store for the citizen's requests: one module-level list shared by Requests, RequestDetail, the tab badge and the Report flow. */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { ReportResult } from "@contracts";
import { catLabel } from "../lib/const";
import { fetchMyRequest, fetchMyRequests, type CitizenRequest, type RequestStatus } from "./requestsApi";

const EXTRAS_KEY = "cf_my_requests";
type Extras = Record<string, { my_category?: string; my_severity?: number }>;
const readExtras = (): Extras => { try { return JSON.parse(localStorage.getItem(EXTRAS_KEY) || "{}"); } catch { return {}; } };
const writeExtras = (e: Extras) => { try { localStorage.setItem(EXTRAS_KEY, JSON.stringify(e)); } catch { /* ignore */ } };

let state: { list: CitizenRequest[] | null; error: string | null } = { list: null, error: null };
let gen = 0;
const pending = new Map<string, number>();   // locally inserted ids not yet seen on the server -> insert time
const blobs = new Map<string, string>();     // request id -> local preview blob URL, kept until the server photo has loaded
const subs = new Set<() => void>();
const set = (next: Partial<typeof state>) => { state = { ...state, ...next }; subs.forEach((f) => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const snap = () => state;

/** Forget everything (new citizen). */
export function resetRequestsStore() {
  blobs.forEach((u) => { try { URL.revokeObjectURL(u); } catch { /* ignore */ } });
  blobs.clear(); pending.clear(); gen++;
  set({ list: null, error: null });
}

function adopt(server: CitizenRequest): CitizenRequest {
  const ex = readExtras()[server.id];
  const out = { ...server };
  if (ex?.my_category) out.my_category = ex.my_category;
  if (ex?.my_severity != null && out.my_severity == null) out.my_severity = ex.my_severity;
  const blob = blobs.get(server.id);
  if (blob) {
    if (out.my_photo_url) {
      // keep showing the local photo until the server copy has loaded, then swap (no flicker)
      const id = server.id, url = out.my_photo_url, g = gen;
      const img = new Image();
      img.onload = img.onerror = () => {
        if (g !== gen || blobs.get(id) !== blob) return;
        blobs.delete(id);
        set({ list: (state.list ?? []).map((r) => (r.id === id ? { ...r, photo_url: url, my_photo_url: url } : r)) });
        try { URL.revokeObjectURL(blob); } catch { /* ignore */ }
      };
      img.src = url;
    }
    out.my_photo_url = blob; out.photo_url = blob;
  }
  return out;
}

function applyServerList(list: CitizenRequest[]) {
  const ids = new Set(list.map((r) => r.id));
  ids.forEach((id) => pending.delete(id));
  const keep = (state.list ?? []).filter((r) => !ids.has(r.id) && pending.has(r.id) && Date.now() - (pending.get(r.id) ?? 0) < 60000);
  const merged = [...keep, ...list.map(adopt)];
  merged.sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
  set({ list: merged, error: null });
}

export async function refreshRequests(): Promise<void> {
  const g = gen;
  try {
    const list = await fetchMyRequests();
    if (g === gen) applyServerList(list);
  } catch (e) {
    if (g === gen) set({ error: String((e as Error)?.message ?? e) });
  }
}

async function refreshOne(id: string) {
  const g = gen;
  try {
    const r = await fetchMyRequest(id);
    if (g !== gen) return;
    pending.delete(id);
    const a = adopt(r);
    const cur = state.list ?? [];
    set({ list: cur.some((x) => x.id === id) ? cur.map((x) => (x.id === id ? a : x)) : [a, ...cur], error: null });
  } catch (e) {
    if (g === gen) set({ error: String((e as Error)?.message ?? e) });
  }
}

const DUE_DAYS = { P1: 2, P2: 5, P3: 10, P4: 14 } as const;
const STAGE: Record<RequestStatus, string> = { reported: "Reported", assigned: "Crew assigned", in_progress: "Work in progress", awaiting_verification: "Awaiting verification", fixed: "Fixed" };

/** Build a request from a fresh ReportResult and show it at once; the server version replaces it on refetch (same id). */
export function insertFromResult(res: ReportResult, o: { photo?: Blob | null; note: string; category: string; severity: number }): string | null {
  const c = res.cluster;
  if (!c || (res.outcome !== "created" && res.outcome !== "merged")) return null;
  const now = new Date().toISOString();
  const blob = o.photo ? URL.createObjectURL(o.photo) : null;
  if (blob) blobs.set(c.id, blob);
  const mine = blob ?? res.my_photo_url ?? null;
  const label = catLabel(c.category);
  const title = c.address ? `${label} near ${c.address}` : c.neighborhood ? `${label} in ${c.neighborhood}` : label;
  const status: RequestStatus = c.status === "fixed" ? "fixed" : c.vendor ? "assigned" : "reported";
  let due: string | null = null;
  try { due = new Date(new Date(c.first_reported_at).getTime() + DUE_DAYS[c.bucket] * 86400000).toISOString(); } catch { /* ignore */ }
  const created = res.outcome === "created";
  const reported = { ts: c.first_reported_at, label: "Reported", detail: "" };
  const you = { ts: now, label: "You reported this", detail: "" };
  const timeline = created ? [you, reported] : [reported, you];
  if (c.vendor) timeline.push({ ts: c.first_reported_at, label: "Crew assigned", detail: c.vendor });
  const req: CitizenRequest = {
    id: c.id, category: c.category, title, address: c.address ?? null, neighborhood: c.neighborhood ?? null, district: c.district ?? null,
    zones: c.zones ?? [], photo_url: mine ?? c.photo_url ?? null, my_photo_url: mine, issue_photo_url: c.photo_url ?? null,
    neighbors: Math.max(1, res.neighbors || c.reporter_count), status, stage_label: STAGE[status],
    ticket_id: res.ticket?.id ?? c.ticket_id ?? null, crew: c.vendor ?? null, due, priority_bucket: c.bucket, rationale: c.rationale,
    detected: { category: c.category, severity: c.severity, is_hazard: c.is_hazard, hazard_description: c.hazard_description },
    my_points: res.points_awarded, created_at: c.first_reported_at, updated_at: now, timeline,
    my_note: o.note.trim() || null, my_category: o.category, my_severity: o.severity, my_reported_at: now,
  };
  const ex = readExtras(); ex[c.id] = { my_category: o.category, my_severity: o.severity }; writeExtras(ex);
  pending.set(c.id, Date.now());
  set({ list: [req, ...(state.list ?? []).filter((r) => r.id !== c.id)], error: null });
  void refreshRequests();
  return c.id;
}

/** Shared list, refetched every `ms` (default 5 s) and updated instantly when something local changes it. */
export function useMyRequests(ms = 5000) {
  const s = useSyncExternalStore(subscribe, snap);
  const [loading, setLoading] = useState(s.list === null);
  useEffect(() => {
    let live = true;
    const run = () => refreshRequests().finally(() => { if (live) setLoading(false); });
    run();
    const t = setInterval(() => { if (!document.hidden) run(); }, ms);
    return () => { live = false; clearInterval(t); };
  }, [ms]);
  const reload = useCallback(() => { void refreshRequests(); }, []);
  return { data: s.list, error: s.list ? null : s.error, loading: loading && s.list === null, reload };
}

export function useMyRequest(id: string, ms = 5000) {
  const s = useSyncExternalStore(subscribe, snap);
  const data = s.list?.find((r) => r.id === id) ?? null;
  useEffect(() => {
    const run = () => refreshOne(id);
    if (!pending.has(id)) run();
    const t = setInterval(() => { if (!document.hidden) run(); }, ms);
    return () => clearInterval(t);
  }, [id, ms]);
  const reload = useCallback(() => { void refreshOne(id); }, [id]);
  return { data, error: data ? null : s.error, loading: !data && !s.error, reload };
}

/** Number of requests for the tab badge (0 until known). */
export function useRequestCount(): number {
  return useSyncExternalStore(subscribe, snap).list?.length ?? 0;
}
