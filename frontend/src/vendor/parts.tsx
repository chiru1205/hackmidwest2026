import { useEffect, useRef, useState, type ReactNode } from "react";
import maplibregl from "maplibre-gl";
import {
  Construction, Lightbulb, TrafficCone, Footprints, CircleDashed, Trash2, Brush, TreePine, Waves, MapPin, Check,
} from "lucide-react";
import type { Category, Cluster } from "@contracts";
import { motion } from "framer-motion";
import { spring } from "../components/ui";

const ICONS: Record<string, typeof MapPin> = {
  pothole: Construction, streetlight_out: Lightbulb, traffic_signal: TrafficCone, sidewalk_damage: Footprints,
  manhole_cover: CircleDashed, road_debris: Trash2, graffiti: Brush, illegal_dumping: Trash2, downed_tree: TreePine,
  flooding: Waves,
};
export function CategoryIcon({ category, size = 20 }: { category: Category | string; size?: number }) {
  const I = ICONS[category] ?? MapPin;
  return <I size={size} strokeWidth={1.75} aria-hidden />;
}

/** Photo with skeleton while loading and a designed placeholder when missing or broken. */
export function Photo({ src, category, alt, size = "md", label }: {
  src?: string | null; category: Category | string; alt: string; size?: "sm" | "md" | "lg"; label?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [bad, setBad] = useState(!src);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    setBad(!src);
    const im = ref.current;
    setLoaded(!!(im && im.complete && im.naturalWidth > 0));
  }, [src]);
  return (
    <div className={`vd-photo vd-photo--${size}`}>
      {!loaded && (
        <div className={`vd-photo__ph ${bad ? "" : "ui-skeleton"}`}>
          {bad && (<><CategoryIcon category={category} size={size === "sm" ? 20 : 32} />{size !== "sm" && <span>{label ?? "No photo attached"}</span>}</>)}
        </div>
      )}
      {src && !bad && (
        <img ref={ref} key={src} src={src} alt={alt} onLoad={() => setLoaded(true)} onError={() => setBad(true)} style={{ opacity: loaded ? 1 : 0 }} />
      )}
    </div>
  );
}

/** Small static map with a pin. Falls back to a drawn street grid when tiles or WebGL are unavailable. */
export function MapThumb({ cluster }: { cluster: Cluster }) {
  const el = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!el.current) return;
    let map: maplibregl.Map | null = null;
    try {
      map = new maplibregl.Map({
        container: el.current, style: "https://tiles.openfreemap.org/styles/positron",
        center: [cluster.lng, cluster.lat], zoom: 15.2, interactive: false, attributionControl: false,
      });
      map.on("load", () => setReady(true));
    } catch { /* optional */ }
    return () => { map?.remove(); };
  }, [cluster.id, cluster.lat, cluster.lng]);
  return (
    <div className="vd-map" aria-label={`Map near ${cluster.address ?? cluster.neighborhood ?? "location"}`} role="img">
      <svg className="vd-map__grid" viewBox="0 0 120 90" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <path d="M0 62 L120 38 M0 20 L120 74 M38 0 L58 90 M84 0 L74 90" />
      </svg>
      <div ref={el} className="vd-map__gl" style={{ opacity: ready ? 1 : 0 }} />
      <span className="vd-map__pin" aria-hidden />
    </div>
  );
}

export interface TLStep { key: string; label: string; detail?: string; ts?: string; state: "done" | "current" | "todo"; tone?: "success" }

export function Timeline({ steps, fmt }: { steps: TLStep[]; fmt: (iso: string) => string }) {
  return (
    <ol className="vd-tl">
      {steps.map((s, i) => (
        <motion.li
          key={s.key} className={`vd-tl__item is-${s.state} ${s.tone ? "is-success" : ""}`}
          initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring.soft, delay: i * 0.04 }}
        >
          <span className="vd-tl__node" aria-hidden>{s.state === "done" && <Check size={11} strokeWidth={3} />}</span>
          <div className="vd-tl__body">
            <div className="vd-tl__label">{s.label}</div>
            {s.detail && <div className="vd-tl__detail">{s.detail}</div>}
          </div>
          <div className="vd-tl__ts">{s.ts && s.state !== "todo" ? fmt(s.ts) : ""}</div>
        </motion.li>
      ))}
    </ol>
  );
}

export function Prop({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`vd-prop${wide ? " is-wide" : ""}`}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
