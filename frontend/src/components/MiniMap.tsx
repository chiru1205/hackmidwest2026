import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { Cluster } from "@contracts";
import { clusterColor } from "../lib/const";

interface Props {
  lat: number; lng: number; onPin: (lat: number, lng: number) => void; clusters?: Cluster[];
}

/** Small light map with a draggable "you" pin and nearby cluster dots. */
export default function MiniMap({ lat, lng, onPin, clusters = [] }: Props) {
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
        container: el.current, style: "https://tiles.openfreemap.org/styles/liberty",
        center: [lng, lat], zoom: 16, attributionControl: { compact: true },
      });
      map.current = m;
      const mk = new maplibregl.Marker({ draggable: true, color: "#FF6B1A" }).setLngLat([lng, lat]).addTo(m);
      mk.on("dragend", () => { const p = mk.getLngLat(); onPinRef.current(p.lat, p.lng); });
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
      const s = 14 + Math.min(18, Math.log2(1 + c.reporter_count) * 3);
      d.style.cssText = `width:${s}px;height:${s}px;border-radius:50%;background:${clusterColor(c)};border:2px solid #fff;opacity:.9`;
      return new maplibregl.Marker({ element: d }).setLngLat([c.lng, c.lat]).addTo(m);
    });
  }, [clusters]);

  return <div ref={el} className="minimap" role="application" aria-label="Map. Drag the orange pin to adjust the location" />;
}
