import { forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import maplibre from "maplibre-gl";
import { Users, Ticket as TicketIcon } from "lucide-react";
import type { Cluster } from "@contracts";
import { KC_CENTER, catLabel } from "../lib/const";
import { PriorityBadge, StatusBadge } from "../components/ui";
import type { GeofenceLayers } from "../lib/api";
import { Photo, cleanAddress } from "./util";
import { DevRevChip, DevRevCtx, useDevRevTicket } from "./devrev";

export interface OpsMapHandle {
  spawn(lat: number, lng: number): void;
  fit(): void;
  flyTo(lat: number, lng: number, zoom: number): void;
}
export interface GeoFlags { hoods: boolean; zones: boolean; shade: boolean }
interface Props { clusters: Cluster[]; selected: string | null; onSelect: (id: string) => void; geo?: GeofenceLayers | null; flags?: GeoFlags }

export const ZONE_COL = { school: "#0E9F9A", hospital: "#6D5BD0", arterial: "#64748B" } as const;
const ZONE_RING = (lat: number, lng: number, r: number) => {
  const n = 40, dLat = r / 111320, dLng = r / (111320 * Math.cos((lat * Math.PI) / 180));
  const ring: [number, number][] = [];
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; ring.push([+(lng + Math.cos(a) * dLng).toFixed(6), +(lat + Math.sin(a) * dLat).toFixed(6)]); }
  return ring;
};
const NO_FLAGS: GeoFlags = { hoods: false, zones: false, shade: false };

/** Map content area: keeps pins clear of the KPI bar (top), the right column and the bottom strip. */
export const PAD = { top: 170, bottom: 190, left: 48, right: 424 };
const sizeFor = (c: Cluster) => Math.round(14 + Math.min(36, Math.sqrt(c.reporter_count) * 3.4));
const pinClass = (c: Cluster) => (c.status === "fixed" ? "pin--fixed" : `pin--${c.bucket}`);

interface Particle { lng: number; lat: number; tlng: number; tlat: number; ox: number; oy: number; t0: number; dur: number; col: string; bend: number }

const OpsMap = forwardRef<OpsMapHandle, Props>(function OpsMap({ clusters, selected, onSelect, geo = null, flags = NO_FLAGS }, ref) {
  const el = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const map = useRef<maplibre.Map | null>(null);
  const [ready, setReady] = useState(false);
  const markers = useRef(new Map<string, { m: maplibre.Marker; node: HTMLDivElement; pin: HTMLDivElement; count: number }>());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const clustersRef = useRef<Cluster[]>(clusters);
  clustersRef.current = clusters;
  const fitted = useRef(false);
  const firstPaint = useRef(true);
  const particles = useRef<Particle[]>([]);
  const raf = useRef(0);
  const geoRef = useRef(geo); geoRef.current = geo;
  const flagsRef = useRef(flags); flagsRef.current = flags;
  const hoodN = useRef<Record<string, number>>({});
  const hoodHover = useRef<string | null>(null);
  const tip = useRef<maplibre.Popup | null>(null);
  const drMap = useContext(DevRevCtx);

  // hover popover
  const [hoverId, setHoverId] = useState<string | null>(null);
  const popup = useRef<maplibre.Popup | null>(null);
  const popupEl = useRef<HTMLDivElement | null>(null);
  if (!popupEl.current && typeof document !== "undefined") {
    popupEl.current = document.createElement("div");
    popupEl.current.setAttribute("data-theme", "light");
  }
  const hideTimer = useRef<number>();

  const fit = useCallback(() => {
    const m = map.current; const cl = clustersRef.current;
    if (!m || cl.length === 0) return;
    const q = (v: number[], p: number) => v[Math.min(v.length - 1, Math.max(0, Math.floor(p * (v.length - 1))))];
    const lats = cl.map((c) => c.lat).sort((a, b) => a - b);
    const lngs = cl.map((c) => c.lng).sort((a, b) => a - b);
    const lo = cl.length > 20 ? 0.08 : 0, hi = cl.length > 20 ? 0.92 : 1;
    const b = new maplibre.LngLatBounds([q(lngs, lo), q(lats, lo)], [q(lngs, hi), q(lats, hi)]);
    m.fitBounds(b, { padding: PAD, maxZoom: 12.6, duration: 1400, essential: true });
  }, []);

  /* ---------- map ---------- */
  useEffect(() => {
    if (!el.current) return;
    try {
      const m = new maplibre.Map({
        container: el.current, style: "https://tiles.openfreemap.org/styles/positron",
        center: KC_CENTER, zoom: 10.6, attributionControl: false, dragRotate: false, pitchWithRotate: false,
      });
      m.addControl(new maplibre.AttributionControl({ compact: true }), "bottom-left");
      m.touchZoomRotate.disableRotation();
      m.on("load", () => setReady(true));
      map.current = m;
      if (import.meta.env.DEV) (window as unknown as { __opsMap?: unknown }).__opsMap = m;
      popup.current = new maplibre.Popup({ closeButton: false, closeOnClick: false, className: "ops-popup", maxWidth: "none", anchor: "bottom" });
    } catch { /* no WebGL: the rest of the screen still works */ }
    const mk = markers.current;
    return () => { cancelAnimationFrame(raf.current); mk.forEach((v) => v.m.remove()); mk.clear(); popup.current?.remove(); map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => { if (ready && !fitted.current && clusters.length) { fitted.current = true; fit(); const t = window.setTimeout(fit, 900); return () => window.clearTimeout(t); } }, [ready, clusters.length, fit]);

  /* ---------- geofence layers (lazy, re-added after any style change) ---------- */
  const applyVis = useCallback(() => {
    const m = map.current; const f = flagsRef.current;
    if (!m) return;
    try {
      const vis = (id: string, on: boolean) => { if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", on ? "visible" : "none"); };
      vis("gf-hood-fill", f.hoods); vis("gf-hood-line", f.hoods); vis("gf-zone-fill", f.zones); vis("gf-zone-line", f.zones);
      if (m.getLayer("gf-hood-fill")) {
        const hov: any = ["case", ["boolean", ["feature-state", "hover"], false], 0.16, 0];
        const n: any = ["coalesce", ["feature-state", "n"], 0];
        const shade: any = f.shade ? ["interpolate", ["linear"], n, 0, 0, 1, 0.07, 6, 0.2, 14, 0.32] : 0;
        m.setPaintProperty("gf-hood-fill", "fill-opacity", ["+", hov, shade]);
      }
    } catch { /* style mid-change */ }
  }, []);

  const applyCounts = useCallback(() => {
    const m = map.current; const g = geoRef.current;
    if (!m || !g || !m.getSource("gf-hoods")) return;
    const counts: Record<string, number> = {};
    clustersRef.current.forEach((c) => { if (c.status !== "fixed" && c.neighborhood) counts[c.neighborhood] = (counts[c.neighborhood] ?? 0) + 1; });
    hoodN.current = counts;
    try {
      g.neighborhoods.features.forEach((f) => m.setFeatureState({ source: "gf-hoods", id: f.properties.name }, { n: counts[f.properties.name] ?? 0 }));
    } catch { /* source not ready */ }
  }, []);

  const ensureGeo = useCallback(() => {
    const m = map.current; const g = geoRef.current;
    if (!m || !g) return;
    try {
      if (m.getSource("gf-hoods")) return;
      const before = m.getStyle().layers?.find((l) => l.type === "symbol")?.id;
      m.addSource("gf-hoods", { type: "geojson", data: g.neighborhoods as any, promoteId: "name", tolerance: 0.6 });
      const zf = g.zones.map((z) => ({ type: "Feature" as const, properties: { type: z.type, name: z.name, radius_m: z.radius_m }, geometry: { type: "Polygon" as const, coordinates: [ZONE_RING(z.lat, z.lng, z.radius_m)] } }));
      m.addSource("gf-zones", { type: "geojson", data: { type: "FeatureCollection", features: zf } as any });
      const zc: any = ["match", ["get", "type"], "school", ZONE_COL.school, "hospital", ZONE_COL.hospital, ZONE_COL.arterial];
      m.addLayer({ id: "gf-hood-fill", type: "fill", source: "gf-hoods", paint: { "fill-color": "#2457FF", "fill-opacity": 0 } }, before);
      m.addLayer({ id: "gf-hood-line", type: "line", source: "gf-hoods", paint: { "line-color": "#3F4F6B", "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.7, 14, 1.6], "line-opacity": 0.7 } }, before);
      m.addLayer({ id: "gf-zone-fill", type: "fill", source: "gf-zones", paint: { "fill-color": zc, "fill-opacity": 0.16 } }, before);
      m.addLayer({ id: "gf-zone-line", type: "line", source: "gf-zones", paint: { "line-color": zc, "line-width": 1.4, "line-opacity": 0.8 } }, before);
    } catch { /* retried on next styledata */ }
    applyVis(); applyCounts();
  }, [applyVis, applyCounts]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const again = () => { if (geoRef.current && !m.getSource("gf-hoods")) ensureGeo(); };
    m.on("styledata", again);
    return () => { m.off("styledata", again); };
  }, [ready, ensureGeo]);
  useEffect(() => { if (ready && geo) ensureGeo(); }, [ready, geo, ensureGeo]);
  useEffect(() => { if (ready) applyVis(); }, [ready, flags.hoods, flags.zones, flags.shade, applyVis]);
  useEffect(() => { if (ready) applyCounts(); }, [ready, geo, clusters, applyCounts]);

  // hover: highlight a neighborhood and name it, or name a zone
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    if (!tip.current) tip.current = new maplibre.Popup({ closeButton: false, closeOnClick: false, className: "ops-hood-tip", maxWidth: "none", offset: 14 });
    const t = tip.current;
    const unhover = () => {
      if (hoodHover.current) { try { m.setFeatureState({ source: "gf-hoods", id: hoodHover.current }, { hover: false }); } catch { /* */ } hoodHover.current = null; }
    };
    const clear = () => { unhover(); t.remove(); };
    const move = (e: maplibre.MapMouseEvent) => {
      const f = flagsRef.current;
      const layers = [f.zones && "gf-zone-fill", f.hoods && "gf-hood-fill"].filter((x): x is string => !!x && !!m.getLayer(x));
      if (!layers.length) { clear(); return; }
      const hits = m.queryRenderedFeatures(e.point, { layers });
      const z = hits.find((h) => h.layer.id === "gf-zone-fill");
      const h = hits.find((x) => x.layer.id === "gf-hood-fill");
      const name = h ? String(h.properties?.name) : null;
      if (hoodHover.current !== name) {
        unhover();
        hoodHover.current = name;
        if (name) { try { m.setFeatureState({ source: "gf-hoods", id: name }, { hover: true }); } catch { /* */ } }
      }
      if (!z && !h) { t.remove(); return; }
      const box = document.createElement("div");
      box.setAttribute("data-theme", "light");
      box.className = "ops-hood-tip__box";
      const b = document.createElement("b");
      const sub = document.createElement("span");
      if (z) {
        const ty = String(z.properties?.type);
        b.textContent = String(z.properties?.name);
        sub.textContent = `${ty === "school" ? "School zone" : ty === "hospital" ? "Hospital zone" : "Arterial corridor"}, ${Math.round(Number(z.properties?.radius_m))} m radius`;
      } else if (h && name) {
        b.textContent = name;
        const d = h.properties?.district ? String(h.properties.district) : "";
        const n = hoodN.current[name] ?? 0;
        sub.textContent = `${d ? d + " · " : ""}${n} open ${n === 1 ? "issue" : "issues"}`;
      }
      box.append(b, sub);
      t.setLngLat(e.lngLat).setDOMContent(box);
      if (!t.isOpen()) t.addTo(m);
    };
    m.on("mousemove", move); m.on("mouseout", clear);
    return () => { m.off("mousemove", move); m.off("mouseout", clear); clear(); };
  }, [ready]);

  /* ---------- pins ---------- */
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const seen = new Set<string>();
    const initial = firstPaint.current;
    clusters.forEach((c, idx) => {
      seen.add(c.id);
      const s = sizeFor(c);
      let entry = markers.current.get(c.id);
      let bump = false;
      if (!entry) {
        const node = document.createElement("div");
        node.className = "ops-pin";
        node.tabIndex = 0;
        node.setAttribute("role", "button");
        const pin = document.createElement("div");
        pin.style.animationDelay = initial ? `${Math.min(900, idx * 9)}ms` : "0ms";
        pin.dataset.fresh = "1";
        node.appendChild(pin);
        node.onclick = (e) => { e.stopPropagation(); onSelectRef.current(c.id); };
        node.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectRef.current(c.id); } };
        node.onmouseenter = () => { window.clearTimeout(hideTimer.current); setHoverId(c.id); };
        node.onmouseleave = () => { hideTimer.current = window.setTimeout(() => setHoverId(null), 120); };
        node.onfocus = () => setHoverId(c.id);
        node.onblur = () => setHoverId(null);
        entry = { node, pin, m: new maplibre.Marker({ element: node }).setLngLat([c.lng, c.lat]).addTo(m), count: c.reporter_count };
        markers.current.set(c.id, entry);
        window.setTimeout(() => { if (entry) { entry.pin.dataset.fresh = "0"; entry.pin.style.animationDelay = "0ms"; } }, 1900);
      } else if (entry.count !== c.reporter_count) {
        entry.count = c.reporter_count;
        bump = true;
      }
      const { node, pin } = entry;
      node.style.width = node.style.height = `${s}px`;
      const cls = ["ops-pin__dot", pinClass(c)];
      if (c.bucket === "P1" && c.status !== "fixed") cls.push("is-pulse");
      if (pin.dataset.fresh === "1") cls.push("is-new");
      if (node.classList.contains("is-sel")) cls.push("is-sel");
      pin.className = cls.join(" ");
      if (bump) { void pin.offsetWidth; pin.classList.add("is-bump"); window.setTimeout(() => pin.classList.remove("is-bump"), 700); }
      pin.textContent = s >= 28 ? String(c.reporter_count) : "";
      const dt = drMap.get(c.id);
      const flag = !!dt && (dt.overdue || dt.escalated) && c.status !== "fixed";
      let fl = node.querySelector<HTMLElement>(".ops-pin__flag");
      if (flag && !fl) { fl = document.createElement("i"); fl.className = "ops-pin__flag"; node.appendChild(fl); }
      if (fl) { if (flag) { fl.classList.toggle("is-esc", !!dt?.escalated); fl.title = dt?.escalated ? "Escalated" : "Overdue"; } else fl.remove(); }
      node.setAttribute("aria-label", `${catLabel(c.category)} ${c.bucket}, ${c.reporter_count} reporters${flag ? (dt?.escalated ? ", escalated" : ", overdue") : ""}`);
      node.style.zIndex = String(c.bucket === "P1" ? 4 : c.bucket === "P2" ? 3 : 2);
    });
    markers.current.forEach((v, id) => { if (!seen.has(id)) { v.m.remove(); markers.current.delete(id); } });
    if (clusters.length) firstPaint.current = false;
  }, [clusters, drMap]);

  useEffect(() => {
    markers.current.forEach((v, id) => {
      v.node.classList.toggle("is-sel", id === selected);
      v.pin.classList.toggle("is-sel", id === selected);
      if (id === selected) v.node.style.zIndex = "9";
    });
    const c = clustersRef.current.find((x) => x.id === selected);
    if (c) map.current?.easeTo({ center: [c.lng, c.lat], zoom: Math.max(map.current.getZoom(), 13.2), duration: 900, padding: PAD, essential: true });
  }, [selected]);

  /* ---------- hover popover ---------- */
  const hovered = hoverId ? clusters.find((c) => c.id === hoverId) ?? null : null;
  useEffect(() => {
    const p = popup.current; const m = map.current;
    if (!p || !m) return;
    if (hovered && popupEl.current) {
      p.setLngLat([hovered.lng, hovered.lat]).setDOMContent(popupEl.current).setOffset([0, -(sizeFor(hovered) / 2 + 10)]);
      if (!p.isOpen()) p.addTo(m);
    } else if (p.isOpen()) p.remove();
  }, [hovered]);

  /* ---------- particle flow ---------- */
  const colorOf = useRef<Record<string, string>>({});
  const draw = useCallback((now: number) => {
    const cv = canvas.current; const m = map.current;
    raf.current = 0;
    if (!cv || !m) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.globalCompositeOperation = "source-over";
    const live: Particle[] = [];
    for (const p of particles.current) {
      const t = (now - p.t0) / p.dur;
      if (t >= 1) continue;
      live.push(p);
      if (t < 0) continue;
      const a = m.project([p.lng, p.lat]); const b = m.project([p.tlng, p.tlat]);
      const sx = a.x + p.ox, sy = a.y + p.oy;
      const mx = (sx + b.x) / 2 + (b.y - sy) * p.bend, my = (sy + b.y) / 2 - (b.x - sx) * p.bend;
      const at = (u: number) => { const k = 1 - u; return [k * k * sx + 2 * k * u * mx + u * u * b.x, k * k * sy + 2 * k * u * my + u * u * b.y] as const; };
      const e = t * t * (3 - 2 * t);
      const [x, y] = at(e);
      const [x0, y0] = at(Math.max(0, e - 0.16));
      const alpha = Math.min(1, t * 6) * (1 - Math.max(0, (t - 0.8) / 0.2));
      const g = ctx.createLinearGradient(x0, y0, x, y);
      g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(1, p.col);
      ctx.globalAlpha = alpha * 0.8; ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y); ctx.stroke();
      ctx.globalAlpha = alpha; ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(x, y, 2.4 * (1 - e * 0.5), 0, Math.PI * 2); ctx.fill();
    }
    particles.current = live;
    if (live.length) raf.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    const cv = canvas.current; const host = el.current;
    if (!cv || !host) return;
    const size = () => { const dpr = window.devicePixelRatio || 1; cv.width = host.clientWidth * dpr; cv.height = host.clientHeight * dpr; };
    size();
    const ro = new ResizeObserver(() => { size(); map.current?.resize(); }); ro.observe(host);
    const cs = getComputedStyle(cv);
    const v = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
    colorOf.current = { P1: v("--p1", "#E5484D"), P2: v("--p2", "#F97316"), P3: v("--p3", "#F5B301"), P4: v("--p4", "#8A97AD"), fixed: v("--success", "#12B981") };
    return () => ro.disconnect();
  }, []);

  useImperativeHandle(ref, () => ({
    spawn(lat, lng) {
      if (!map.current || particles.current.length > 160 || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
      let best: Cluster | null = null, bd = Infinity;
      for (const c of clustersRef.current) { const d = (c.lat - lat) ** 2 + (c.lng - lng) ** 2; if (d < bd) { bd = d; best = c; } }
      const ang = Math.random() * Math.PI * 2, r = 70 + Math.random() * 170;
      particles.current.push({
        lng, lat, tlng: best?.lng ?? lng, tlat: best?.lat ?? lat, ox: Math.cos(ang) * r, oy: Math.sin(ang) * r * 0.7,
        t0: performance.now() + Math.random() * 120, dur: 750 + Math.random() * 500, bend: (Math.random() - 0.5) * 0.5,
        col: colorOf.current[best ? (best.status === "fixed" ? "fixed" : best.bucket) : "P2"] ?? "#fff",
      });
      if (!raf.current) raf.current = requestAnimationFrame(draw);
    },
    fit,
    flyTo(lat, lng, zoom) { map.current?.flyTo({ center: [lng, lat], zoom, duration: 1600, padding: PAD, essential: true }); },
  }), [draw, fit]);

  return (
    <>
      <div ref={el} className="ops-map" aria-label="Live map of reported issues" />
      <canvas ref={canvas} className="ops-flow" aria-hidden />
      {popupEl.current && hovered && createPortal(<PinCard c={hovered} />, popupEl.current)}
    </>
  );
});
export default OpsMap;

function PinCard({ c }: { c: Cluster }) {
  const dt = useDevRevTicket(c.id);
  return (
    <div className="ops-pcard">
      <Photo url={c.photo_url} category={c.category} className="ops-pcard__photo" />
      <div className="ops-pcard__body">
        <div className="ops-pcard__top"><PriorityBadge bucket={c.bucket} size="sm" /><StatusBadge status={c.status} size="sm" /></div>
        <div className="ops-pcard__title">{catLabel(c.category)}</div>
        <div className="ops-pcard__addr">{cleanAddress(c)}</div>
        <div className="ops-pcard__meta">
          <span><Users size={14} strokeWidth={1.75} />{c.reporter_count.toLocaleString()} {c.reporter_count === 1 ? "neighbor" : "neighbors"}</span>
          {c.ticket_id && <span className="t-mono"><TicketIcon size={14} strokeWidth={1.75} />{c.ticket_id}</span>}
        </div>
        {dt?.devrev_id && <div className="ops-pcard__dr"><DevRevChip t={dt} /></div>}
      </div>
    </div>
  );
}
