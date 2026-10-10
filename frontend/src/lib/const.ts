import type { Bucket, Category, ClusterStatus } from "@contracts";

export const CATEGORIES: { id: Category; label: string; glyph: string }[] = [
  { id: "pothole", label: "Pothole", glyph: "◖" },
  { id: "streetlight_out", label: "Streetlight out", glyph: "☀" },
  { id: "sidewalk_damage", label: "Sidewalk damage", glyph: "▤" },
  { id: "manhole_cover", label: "Manhole cover", glyph: "◎" },
  { id: "road_debris", label: "Road debris", glyph: "✦" },
  { id: "graffiti", label: "Graffiti", glyph: "✎" },
  { id: "illegal_dumping", label: "Illegal dumping", glyph: "▥" },
  { id: "downed_tree", label: "Downed tree", glyph: "♣" },
  { id: "flooding", label: "Flooding", glyph: "≈" },
  { id: "traffic_signal", label: "Traffic signal", glyph: "◍" },
];
export const catLabel = (c: string) =>
  CATEGORIES.find((x) => x.id === c)?.label ?? c.replace(/_/g, " ");

export const BUCKET_COLOR: Record<Bucket, string> = {
  P1: "#D7263D",
  P2: "#FF6B1A",
  P3: "#F2B134",
  P4: "#8B95A7",
};
export const FIXED_COLOR = "#0F8B8D";

export const STATUS_STEPS: { id: ClusterStatus; label: string }[] = [
  { id: "reported", label: "Reported" },
  { id: "assigned", label: "Assigned" },
  { id: "in_progress", label: "In progress" },
  { id: "fixed", label: "Fixed" },
];

export const DEMO_LOCATION = { lat: 39.042, lng: -94.595 };
export const PRESETS = [
  { name: "Plaza", lat: 39.042, lng: -94.595 },
  { name: "Westport", lat: 39.0525, lng: -94.5953 },
  { name: "Crossroads", lat: 39.0856, lng: -94.5811 },
];
export const KC_CENTER: [number, number] = [-94.5786, 39.0997];

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
export const clusterColor = (c: { bucket: Bucket; status: ClusterStatus }) =>
  c.status === "fixed" ? FIXED_COLOR : BUCKET_COLOR[c.bucket];
