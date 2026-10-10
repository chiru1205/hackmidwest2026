import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";

interface Pt { lat: number; lng: number }
interface Props {
  center: Pt & { wide: boolean };
  /** the deliberately placed pin (null until the citizen taps or drags) */
  pin: Pt | null;
  /** the citizen's GPS position, drawn as a blue dot when no pin is placed */
  you: Pt | null;
  onPin: (lat: number, lng: number) => void;
}

/** Compact map. The pin only appears once the citizen places it (tap the map, or it already exists); panning is off so the page still scrolls under a thumb. */
export default function PinMap({ center, pin, you, onPin }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const dot = useRef<maplibregl.Marker | null>(null);
  const onPinRef = useRef(onPin);
  onPinRef.current = onPin;
  const first = useRef({ center, pin });

  useEffect(() => {
    if (!el.current) return;
    try {
      const c = first.current.pin ?? first.current.center;
      const m = new maplibregl.Map({
        container: el.current, style: "https://tiles.openfreemap.org/styles/positron",
        center: [c.lng, c.lat], zoom: first.current.pin || !first.current.center.wide ? 16.4 : 10.6, attributionControl: { compact: true },
        dragPan: false, scrollZoom: false, doubleClickZoom: false, touchZoomRotate: false, keyboard: false, dragRotate: false,
      });
      map.current = m;
      m.on("click", (e) => onPinRef.current(e.lngLat.lat, e.lngLat.lng));
    } catch { /* WebGL unavailable: the map is optional */ }
    return () => { map.current?.remove(); map.current = null; marker.current = null; dot.current = null; };
  }, []);

  // pin marker: created on first placement, then moved
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!pin) { marker.current?.remove(); marker.current = null; return; }
    if (!marker.current) {
      const node = document.createElement("div");
      node.className = "cz-pin";
      node.innerHTML = '<i class="cz-pin__pulse"></i><svg viewBox="0 0 32 40" width="32" height="40" aria-hidden><path d="M16 0C7.2 0 0 7 0 15.7 0 27 16 40 16 40s16-13 16-24.3C32 7 24.8 0 16 0z" fill="#FF5B2E"/><circle cx="16" cy="15.5" r="6" fill="#fff"/></svg>';
      const mk = new maplibregl.Marker({ element: node, draggable: true, anchor: "bottom" }).setLngLat([pin.lng, pin.lat]).addTo(m);
      mk.on("dragend", () => { const p = mk.getLngLat(); onPinRef.current(p.lat, p.lng); });
      marker.current = mk;
    } else marker.current.setLngLat([pin.lng, pin.lat]);
  }, [pin?.lat, pin?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!you || pin) { dot.current?.remove(); dot.current = null; return; }
    if (!dot.current) {
      const node = document.createElement("div");
      node.className = "cz-dot";
      node.style.cssText = "width:16px;height:16px;background:#2563EB";
      dot.current = new maplibregl.Marker({ element: node }).setLngLat([you.lng, you.lat]).addTo(m);
    } else dot.current.setLngLat([you.lng, you.lat]);
  }, [you?.lat, you?.lng, !!pin]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const c = pin ?? center;
    map.current?.easeTo({ center: [c.lng, c.lat], zoom: pin || !center.wide ? 16.4 : 10.6, duration: 400 });
  }, [pin?.lat, pin?.lng, center.lat, center.lng, center.wide]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className="cz-minimap" role="application" aria-label="Map. Tap to place the pin, then drag it to adjust the location" />;
}
