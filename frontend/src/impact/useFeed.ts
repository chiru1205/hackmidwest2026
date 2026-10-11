import { useCallback, useEffect, useRef, useState } from "react";
import { usePoll } from "../workflow/useLive";

/** A request that takes longer than this counts as failed, so one hung fetch cannot freeze every later refresh. */
export const FEED_TIMEOUT_MS = 8000;
/** The pill turns to a warning when no refresh has landed for this many poll intervals. */
export const LATE_AFTER = 3;

/** Loads `fn` now and then every `ms`. Keeps the last good data when a later refresh fails; a poll never overlaps a running request. */
export function useFeed<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastOk, setLastOk] = useState<number | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const ctl = useRef<AbortController | null>(null);

  const load = useCallback(async (poll = false) => {
    if (poll && ctl.current) return;
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    let timer = 0;
    // race the request against a timer: the page wrappers do not pass the signal on, so aborting alone cannot end a hung fetch
    const timeout = new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => { c.abort(); reject(new Error("The server took too long to answer")); }, FEED_TIMEOUT_MS);
    });
    try {
      const d = await Promise.race([fnRef.current(c.signal), timeout]);
      if (ctl.current !== c) return;  // replaced by a newer request or unmounted
      setData(d); setError(null); setLastOk(Date.now());
    } catch (e) {
      if (ctl.current === c) setError(e instanceof Error && e.message ? e.message : "Could not load");
    } finally {
      window.clearTimeout(timer);
      if (ctl.current === c) ctl.current = null;
    }
  }, []);

  useEffect(() => { load(); return () => { const c = ctl.current; ctl.current = null; c?.abort(); }; }, [load]);
  usePoll(() => load(true), ms);
  return { data, error, lastOk, retry: () => load() };
}
