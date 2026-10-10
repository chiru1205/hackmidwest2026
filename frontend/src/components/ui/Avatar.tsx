import { useState } from "react";

const HUES = ["#2457FF", "#0E9F8E", "#E5484D", "#F97316", "#6B7FD7", "#12B981", "#C2410C", "#0F766E"];
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";

export function Avatar({ name, src, size = 32, ring, className = "" }: {
  name: string; src?: string | null; size?: number; ring?: boolean; className?: string;
}) {
  const [bad, setBad] = useState(false);
  const bg = HUES[hash(name) % HUES.length];
  return (
    <span
      className={`ui-avatar ${ring ? "has-ring" : ""} ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38), background: bg }}
      title={name}
      role="img"
      aria-label={name}
    >
      {src && !bad ? <img src={src} alt="" onError={() => setBad(true)} /> : initials(name)}
    </span>
  );
}

/** Overlapping avatars with a "+N" overflow chip. Great for "211 neighbors". */
export function AvatarStack({ names, max = 4, size = 28, total }: { names: string[]; max?: number; size?: number; total?: number }) {
  const shown = names.slice(0, max);
  const extra = (total ?? names.length) - shown.length;
  return (
    <span className="ui-avstack" style={{ ["--av" as string]: `${size}px` }}>
      {shown.map((n, i) => <Avatar key={n + i} name={n} size={size} ring />)}
      {extra > 0 && <span className="ui-avatar ui-avatar--more has-ring" style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }}>+{extra > 999 ? "999" : extra}</span>}
    </span>
  );
}
