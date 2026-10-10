import { useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";

const QUERY = "(prefers-reduced-motion: reduce)";

/** True when the OS asks for reduced motion. Live-updating. */
export function useReducedMotion(): boolean {
  const [r, setR] = useState(() => (typeof window !== "undefined" ? window.matchMedia?.(QUERY).matches ?? false : false));
  useEffect(() => {
    const m = window.matchMedia?.(QUERY);
    if (!m) return;
    const f = () => setR(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return r;
}

/**
 * Animates a number toward `target` (ease-out). Returns the current display value (a float:
 * round it yourself). Jumps instantly under reduced motion. Same signature as the old lib/hooks one.
 */
export function useCountUp(target: number, ms = 800): number {
  const reduced = useReducedMotion();
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (reduced || from.current === target) { from.current = target; setV(target); return; }
    const ctl = animate(from.current, target, {
      duration: ms / 1000, ease: [0.22, 1, 0.36, 1],
      onUpdate: (x) => { from.current = x; setV(x); },
    });
    return () => ctl.stop();
  }, [target, ms, reduced]);
  return v;
}

/** Media query hook, e.g. useMediaQuery("(max-width: 640px)"). */
export function useMediaQuery(query: string): boolean {
  const [m, setM] = useState(() => (typeof window !== "undefined" ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const f = () => setM(mq.matches);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, [query]);
  return m;
}
