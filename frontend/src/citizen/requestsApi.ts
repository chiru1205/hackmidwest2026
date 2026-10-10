import { useCallback, useEffect, useRef, useState } from "react";
import { authHeaders } from "../lib/auth";
import { useToast } from "../components/ui";

export type RequestStatus = "reported" | "assigned" | "in_progress" | "awaiting_verification" | "fixed";

export interface CitizenRequest {
  id: string;
  category: string;
  title: string;
  address: string | null;
  neighborhood: string | null;
  district: string | null;
  zones: string[];
  photo_url: string | null;
  neighbors: number;
  status: RequestStatus;
  stage_label: string;
  ticket_id: string | null;
  crew: string | null;
  due: string | null;
  priority_bucket: "P1" | "P2" | "P3" | "P4";
  rationale: string;
  detected: { category: string; severity: number | null; is_hazard: boolean | null; hazard_description: string | null };
  my_points: number;
  created_at: string;
  updated_at: string;
  timeline: { ts: string; label: string; detail: string }[];
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: authHeaders() });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try { const j = await res.json(); if (j.detail) msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail); } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const fetchMyRequests = () => get<CitizenRequest[]>("/api/me/requests");
export const fetchMyRequest = (id: string) => get<CitizenRequest>(`/api/me/requests/${encodeURIComponent(id)}`);

export const STAGES = ["Reported", "Crew assigned", "Work in progress", "Awaiting verification", "Fixed"] as const;
export const STAGE_INDEX: Record<string, number> = { reported: 0, assigned: 1, in_progress: 2, awaiting_verification: 3, fixed: 4 };

/** Poll an async source every `ms`. Keeps the last good data on errors. */
function usePoll<T>(fn: () => Promise<T>, ms: number, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let live = true;
    const run = () => fnRef.current()
      .then((d) => { if (live) { setData(d); setError(null); } })
      .catch((e) => { if (live) setError(String(e?.message ?? e)); })
      .finally(() => { if (live) setLoading(false); });
    setLoading(true);
    run();
    const t = setInterval(() => { if (!document.hidden) run(); }, ms);
    return () => { live = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, ms]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}

export const useMyRequests = (ms = 5000) => usePoll(fetchMyRequests, ms, []);
export const useMyRequest = (id: string, ms = 5000) => usePoll(() => fetchMyRequest(id), ms, [id]);

const SEEN_KEY = "cf_fixed_seen";
function readSeen(): string[] | null {
  try { const v = localStorage.getItem(SEEN_KEY); return v ? JSON.parse(v) : null; } catch { return null; }
}
function writeSeen(ids: string[]) { try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids)); } catch { /* ignore */ } }

/** Toast once per request, the first time it is seen as fixed. Already-fixed requests on first ever load are seeded silently. */
export function useFixedToasts(list: CitizenRequest[] | null) {
  const toast = useToast();
  useEffect(() => {
    if (!list) return;
    const fixed = list.filter((r) => r.status === "fixed");
    const seen = readSeen();
    if (seen === null) { writeSeen(fixed.map((r) => r.id)); return; }
    const fresh = fixed.filter((r) => !seen.includes(r.id));
    if (!fresh.length) return;
    writeSeen([...seen, ...fresh.map((r) => r.id)]);
    fresh.forEach((r) => toast(`Fixed! ${r.title}`));
  }, [list, toast]);
}
