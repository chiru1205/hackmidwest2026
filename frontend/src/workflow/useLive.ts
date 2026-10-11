import { useEffect, useRef, useState } from "react";

/** Calls `fn` every `ms` while the tab is visible, and once right away when it becomes visible again. */
export function usePoll(fn: () => void, ms: number) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const tick = () => { if (!document.hidden) ref.current(); };
    const id = window.setInterval(tick, ms);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [ms]);
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const id = window.setTimeout(() => setV(value), ms); return () => window.clearTimeout(id); }, [value, ms]);
  return v;
}

/** Wall clock that re-renders every `ms`. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), ms); return () => window.clearInterval(id); }, [ms]);
  return now;
}
