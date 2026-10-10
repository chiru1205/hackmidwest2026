import { useEffect, useState } from "react";
import { GraduationCap, Hospital, MapPin, Route as RouteIcon } from "lucide-react";
import type { Cluster } from "@contracts";
import { fetchGeofenceLayers, type GeofenceLayers } from "../lib/api";

/* Geofence fields on a cluster (district + zone strings). Read defensively so older payloads still render. */
export const districtOf = (c: Pick<Cluster, "id">): string | null => ((c as { district?: string | null }).district ?? null) || null;
export const zonesOf = (c: Pick<Cluster, "id">): string[] => ((c as { zones?: string[] }).zones ?? []).filter(Boolean);

export type ZoneKind = "school" | "hospital" | "arterial";
export function zoneKind(z: string): ZoneKind {
  const s = z.toLowerCase();
  return s.startsWith("school") ? "school" : s.startsWith("hospital") ? "hospital" : "arterial";
}
const ZICON = { school: GraduationCap, hospital: Hospital, arterial: RouteIcon };

/** Small readable chips: neighborhood, district, zones. Used in queue rows, drawer, vendor page. */
export function GeoChips({ c, zonesOnly = false, max = 2, className = "" }: { c: Cluster; zonesOnly?: boolean; max?: number; className?: string }) {
  const d = districtOf(c), zs = zonesOf(c);
  const shown = zs.slice(0, max);
  return (
    <span className={`geo-chips ${className}`}>
      {!zonesOnly && c.neighborhood && <span className="geo-chip is-hood" title="Neighborhood"><MapPin size={11} strokeWidth={2} aria-hidden />{c.neighborhood}</span>}
      {!zonesOnly && d && <span className="geo-chip is-dist" title="Council district">{d}</span>}
      {shown.map((z) => {
        const k = zoneKind(z), I = ZICON[k];
        return <span key={z} className={`geo-chip is-${k}`} title={z}><I size={11} strokeWidth={2} aria-hidden />{z}</span>;
      })}
      {zs.length > max && <span className="geo-chip is-more" title={zs.slice(max).join(", ")}>+{zs.length - max}</span>}
    </span>
  );
}

/** Lazy, once-per-page-load fetch of the geofence layers. Fails quietly (layers just stay unavailable). */
let cache: GeofenceLayers | null = null;
let inflight: Promise<GeofenceLayers | null> | null = null;
export function loadGeofenceLayers(): Promise<GeofenceLayers | null> {
  if (cache) return Promise.resolve(cache);
  inflight ??= fetchGeofenceLayers().then((d) => (cache = d)).catch(() => null).finally(() => { inflight = null; });
  return inflight;
}
export function useGeofenceLayers(enabled = true, retryMs = 20000): GeofenceLayers | null {
  const [d, setD] = useState<GeofenceLayers | null>(cache);
  useEffect(() => {
    if (!enabled || d) return;
    let dead = false;
    const go = () => loadGeofenceLayers().then((r) => { if (!dead && r) setD(r); });
    void go();
    const t = window.setInterval(() => { if (!cache) void go(); }, retryMs);
    return () => { dead = true; window.clearInterval(t); };
  }, [enabled, d, retryMs]);
  return d;
}
