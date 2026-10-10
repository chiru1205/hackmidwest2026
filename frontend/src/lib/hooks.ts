import { useCallback, useEffect, useRef, useState } from "react";
import type { CivicEvent } from "@contracts";
import { api } from "./api";

export interface Async<T> {
  data: T | null; error: string | null; loading: boolean; reload: () => void; setData: (v: T) => void;
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): Async<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    setLoading(true);
    fn().then((d) => { if (alive.current) { setData(d); setError(null); } })
      .catch((e) => alive.current && setError(String(e.message ?? e)))
      .finally(() => alive.current && setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}

/** Subscribe to the SSE stream for the lifetime of the component. Returns connection state. */
export function useEvents(handler: (e: CivicEvent) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  const [connected, setConnected] = useState(false);
  useEffect(() => api.subscribe((e) => ref.current(e), setConnected), []);
  return connected;
}

export function useReducedMotion(): boolean {
  const [r, setR] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const f = () => setR(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return r;
}

export function useCountUp(target: number, ms = 700): number {
  const [v, setV] = useState(target);
  const from = useRef(target);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) { setV(target); from.current = target; return; }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      const cur = a + (target - a) * e;
      setV(cur); from.current = cur;
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, reduced]);
  return v;
}
