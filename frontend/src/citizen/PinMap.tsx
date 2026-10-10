import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { Cluster } from "@contracts";

const COLOR: Record<string, string> = { P1: "#E5484D", P2: "#F97316", P3: "#F5B301", P4: "#8A97AD" };

interface Props { lat: number; lng: number; onPin: (lat: number, lng: number) => void; clusters?: Cluster[] }

/** Compact map: the pin is draggable, tapping the map moves it. Panning is off so the page still scrolls under a thumb. */
export default function PinMap({ lat, lng, onPin, clusters = [] }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const dots = useRef<maplibregl.Marker[]>([]);
  const onPinRef = useRef(onPin);
  onPinRef.current = onPin;

  useEffect(() => {
    if (!el.current) return;
    try {
      const m = new maplibregl.Map({
        container: el.current, style: "https://tiles.openfreemap.org/styles/positron",
        center: [lng, lat], zoom: 16.4, attributionControl: { compact: true },
        dragPan: false, scrollZoom: false, doubleClickZoom: false, touchZoomRotate: false, keyboard: false, dragRotate: false,
      });
      map.current = m;
      const pin = document.createElement("div");
      pin.className = "cz-pin";
      pin.innerHTML = '<i class="cz-pin__pulse"></i><svg viewBox="0 0 32 40" width="32" height="40" aria-hidden><path d="M16 0C7.2 0 0 7 0 15.7 0 27 16 40 16 40s16-13 16-24.3C32 7 24.8 0 16 0z" fill="#FF5B2E"/><circle cx="16" cy="15.5" r="6" fill="#fff"/></svg>';
      const mk = new maplibregl.Marker({ element: pin, draggable: true, anchor: "bottom" }).setLngLat([lng, lat]).addTo(m);
      mk.on("dragend", () => { const p = mk.getLngLat(); onPinRef.current(p.lat, p.lng); });
      m.on("click", (e) => onPinRef.current(e.lngLat.lat, e.lngLat.lng));
      marker.current = mk;
    } catch { /* WebGL unavailable: the map is optional */ }
    return () => { map.current?.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    marker.current?.setLngLat([lng, lat]);
    map.current?.easeTo({ center: [lng, lat], duration: 400 });
  }, [lat, lng]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    dots.current.forEach((d) => d.remove());
    dots.current = clusters.slice(0, 20).map((c) => {
      const d = document.createElement("div");
      const s = 14 + Math.min(14, Math.log2(1 + c.reporter_count) * 2.6);
      d.className = "cz-dot";
      d.style.cssText = `width:${s}px;height:${s}px;background:${c.status === "fixed" ? "#12B981" : COLOR[c.bucket]}`;
      return new maplibregl.Marker({ element: d }).setLngLat([c.lng, c.lat]).addTo(m);
    });
  }, [clusters]);

  return <div ref={el} className="cz-minimap" role="application" aria-label="Map. Drag the pin or tap to adjust the location" />;
}
