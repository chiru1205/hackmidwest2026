import { useState } from "react";
import {
  Cone, Footprints, Lightbulb, Paintbrush, Trash2, TreePine, TrafficCone, Waves, CircleDot, Disc, Construction,
} from "lucide-react";
import type { Cluster } from "@contracts";

export const CAT_ICON: Record<string, typeof Cone> = {
  pothole: CircleDot, streetlight_out: Lightbulb, traffic_signal: TrafficCone, sidewalk_damage: Footprints,
  manhole_cover: Disc, road_debris: Construction, graffiti: Paintbrush, illegal_dumping: Trash2,
  downed_tree: TreePine, flooding: Waves, other: Cone,
};

/** "9198 NW Skyview Ave SIGN Kansas City 64154" -> "9198 NW Skyview Ave" */
export function cleanAddress(c: Pick<Cluster, "address" | "neighborhood">): string {
  let a = (c.address ?? "").trim();
  a = a.replace(/\s+Kansas City(,)?(\s+MO)?(\s+\d{5})?$/i, "").replace(/\s+\d{5}$/, "");
  a = a.replace(/\s+(SIGN|SIGNAL|POLE|CURB|ALLEY)$/i, "");
  a = a.replace(/\b([A-Z]{2,})\b/g, (m) => (["NW", "NE", "SW", "SE", "KC", "US", "MO", "N", "S", "E", "W"].includes(m) ? m : m[0] + m.slice(1).toLowerCase()));
  return a || c.neighborhood || "Kansas City";
}

export const fmtClock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

/** Photo with skeleton while loading and a designed placeholder when missing or broken. */
export function Photo({ url, category, className = "", rounded = true }: { url?: string | null; category: string; className?: string; rounded?: boolean }) {
  const [state, setState] = useState<"loading" | "ok" | "err">(url ? "loading" : "err");
  const Icon = CAT_ICON[category] ?? Cone;
  return (
    <div className={`ops-photo ${rounded ? "is-round" : ""} ${state} ${className}`}>
      {state !== "ok" && (
        <div className="ops-photo__ph" aria-hidden>
          {state === "err" && <Icon strokeWidth={1.75} />}
        </div>
      )}
      {url && state !== "err" && (
        <img src={url} alt="" loading="lazy" onLoad={() => setState("ok")} onError={() => setState("err")} />
      )}
    </div>
  );
}
