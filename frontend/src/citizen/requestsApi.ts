import { useEffect } from "react";
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
  my_photo_url?: string | null;
  issue_photo_url?: string | null;
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
  my_note?: string | null;
  my_category?: string | null;
  my_severity?: number | null;
  my_reported_at?: string | null;
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
