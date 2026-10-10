import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  CircleDot, Lightbulb, Footprints, CircleDashed, TriangleAlert, Paintbrush, Trash2, TreeDeciduous, Waves,
  TrafficCone, Check, Zap, ImageOff, MapPin,
} from "lucide-react";
import type { Category, Cluster, EdgeInfo } from "@contracts";
import { Pill, spring } from "../components/ui";

export const CAT_ICON: Record<Category, typeof CircleDot> = {
  pothole: CircleDot, streetlight_out: Lightbulb, sidewalk_damage: Footprints, manhole_cover: CircleDashed,
  road_debris: TriangleAlert, graffiti: Paintbrush, illegal_dumping: Trash2, downed_tree: TreeDeciduous,
  flooding: Waves, traffic_signal: TrafficCone, other: MapPin,
};
export const CatIcon = ({ cat, size = 20 }: { cat: string; size?: number }) => {
  const I = CAT_ICON[cat as Category] ?? MapPin;
  return <I size={size} strokeWidth={1.75} aria-hidden />;
};

const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };

/** Seeded clusters have no photo_url in some builds; fall back to the generated placeholder set. */
export function photoFor(c: Pick<Cluster, "id" | "category" | "photo_url">): string | null {
  if (c.photo_url) return c.photo_url;
  const h = hash(c.id);
  if (c.category === "pothole") return `/photos/seed/pothole_${String((h % 14) + 1).padStart(2, "0")}.jpg`;
  if (c.category === "road_debris") return "/photos/seed/debris_01.jpg";
  if (c.category === "manhole_cover") return "/photos/seed/manhole_01.jpg";
  if (c.category === "sidewalk_damage") return "/photos/seed/sidewalk_01.jpg";
  return null;
}

/** Real <img> with skeleton while loading and a designed fallback. */
export function Photo({ src, cat, alt = "", className = "", children }: { src?: string | null; cat?: string; alt?: string; className?: string; children?: ReactNode }) {
  const [state, setState] = useState<"load" | "ok" | "bad">(src ? "load" : "bad");
  return (
    <div className={`cz-photo ${className}`}>
      {state !== "ok" && (state === "load"
        ? <div className="ui-skeleton cz-photo__skel" aria-hidden />
        : <div className="cz-photo__fallback" aria-hidden>{cat ? <CatIcon cat={cat} size={32} /> : <ImageOff size={28} strokeWidth={1.75} />}</div>)}
      {src && state !== "bad" && (
        <img src={src} alt={alt} loading="lazy" onLoad={() => setState("ok")} onError={() => setState("bad")} style={{ opacity: state === "ok" ? 1 : 0 }} />
      )}
      {children}
    </div>
  );
}

export function EdgePill({ edge }: { edge?: EdgeInfo | null }) {
  if (!edge) return null;
  return (
    <Pill variant={edge.hit ? "success" : "hazard"} size="sm" icon={<Zap size={12} strokeWidth={2} aria-hidden />} title={`Edge cell ${edge.cell}`}>
      Edge {edge.hit ? "HIT" : "MISS"} <span className="t-mono">{edge.ms.toFixed(1)} ms</span>
    </Pill>
  );
}

const STEPS = ["Reported", "Assigned", "In progress", "Fixed"] as const;
const IDX: Record<string, number> = { reported: 0, assigned: 1, in_progress: 2, fixed: 3 };

/** Status drawn as a transit line: four stations, the line fills up to the current one. */
export function RouteStepper({ status }: { status: string }) {
  const idx = IDX[status] ?? 0;
  const fixed = idx === 3;
  return (
    <div className={`cz-route ${fixed ? "is-fixed" : ""}`} role="list" aria-label={`Status: ${STEPS[idx]}`}>
      <div className="cz-route__track" aria-hidden>
        <motion.i className="cz-route__fill" initial={false} animate={{ width: `${(idx / 3) * 100}%` }} transition={spring.slow} />
      </div>
      {STEPS.map((label, i) => {
        const done = i < idx || (fixed && i === idx);
        const now = i === idx && !fixed;
        return (
          <div key={label} role="listitem" className={`cz-route__st ${done ? "is-done" : ""} ${now ? "is-now" : ""}`}>
            <motion.span className="cz-route__dot" initial={false} animate={{ scale: now ? 1.12 : 1 }} transition={spring.pop}>
              {done && <Check size={12} strokeWidth={3} aria-hidden />}
            </motion.span>
            <span className="cz-route__lbl">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

export const NEIGHBOR_NAMES = ["Maria G.", "Devon T.", "Priya S.", "Marcus L.", "Aisha K.", "Tomas R.", "Hana W.", "Luis P."];

export const LEVELS: { name: string; xp: number }[] = [
  { name: "Resident", xp: 0 }, { name: "Watcher", xp: 250 }, { name: "Guardian", xp: 1000 },
  { name: "Champion", xp: 3000 }, { name: "Civic Hero", xp: 10000 },
];
export function levelSpan(xp: number) {
  let i = 0;
  LEVELS.forEach((l, k) => { if (xp >= l.xp) i = k; });
  const lo = LEVELS[i].xp, hi = LEVELS[i + 1]?.xp ?? lo;
  return { index: i, lo, hi, name: LEVELS[i].name, next: LEVELS[i + 1]?.name ?? null, pct: hi > lo ? (xp - lo) / (hi - lo) : 1 };
}

export const shortAddr = (a?: string | null) => (a ?? "").replace(/\s+(SIGN|SIGNAL|N\/A)$/i, "").trim();
export const MapPinIcon = MapPin;
