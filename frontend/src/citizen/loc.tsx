import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEMO_LOCATION } from "../lib/const";

export interface Loc { lat: number; lng: number; accuracy_m: number; source: "gps" | "demo" | "pin" | "override" }
export type LocStatus = "locating" | "gps" | "denied";
interface Ctx {
  /** The spot a report would be sent from; null when we have no real location yet (never silently the demo spot). */
  loc: Loc | null;
  status: LocStatus;
  /** true only when demo mode was explicitly switched on (?demo=1 or a demo preset chosen in this tab) */
  demoOn: boolean;
  /** where the mini map should be centred, and whether that is a wide view */
  mapCenter: { lat: number; lng: number; wide: boolean };
  setPin: (lat: number, lng: number) => void;
  override: (lat: number, lng: number) => void;
  clearOverride: () => void;
  retry: () => void;
  useMyLocation: () => void;
}

const KC = { lat: 39.0997, lng: -94.5786 };

const LocCtx = createContext<Ctx>(null as unknown as Ctx);
export const useLoc = () => useContext(LocCtx);

const ss = {
  get: (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } },
  del: (k: string) => { try { sessionStorage.removeItem(k); } catch { /* ignore */ } },
};

/** Runs once per page load: the old localStorage preset is dropped, and a demo preset only survives a reload while the URL still says ?demo=1. */
function initDemo(): { demo: boolean; ovr: { lat: number; lng: number } | null } {
  try { localStorage.removeItem("cf_loc"); } catch { /* ignore */ }
  let urlDemo = false;
  try { urlDemo = new URLSearchParams(window.location.search).get("demo") === "1"; } catch { /* ignore */ }
  if (!urlDemo) { ss.del("cf_loc"); ss.del("cf_demo"); return { demo: false, ovr: null }; }
  ss.set("cf_demo", "1");
  try { const v = ss.get("cf_loc"); return { demo: true, ovr: v ? JSON.parse(v) : null }; } catch { return { demo: true, ovr: null }; }
}

export function LocProvider({ children }: { children: ReactNode }) {
  const [init] = useState(initDemo);
  const [demo, setDemo] = useState(init.demo);
  const [ovr, setOvr] = useState(init.ovr);
  const [gps, setGps] = useState<Loc | null>(null);
  const [lastGps, setLastGps] = useState<{ lat: number; lng: number } | null>(null);
  const [pin, setPinState] = useState<{ lat: number; lng: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!("geolocation" in navigator)) { setFailed(true); return; }
    setFailed(false);
    const ok = (p: GeolocationPosition) => {
      setFailed(false);
      setGps({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy_m: p.coords.accuracy, source: "gps" });
      setLastGps({ lat: p.coords.latitude, lng: p.coords.longitude });
    };
    const bad = () => setFailed(true);
    navigator.geolocation.getCurrentPosition(ok, bad, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
    const id = navigator.geolocation.watchPosition(ok, bad, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [attempt]);

  const retry = useCallback(() => { setGps(null); setFailed(false); setAttempt((a) => a + 1); }, []);

  const value = useMemo<Ctx>(() => {
    const live = gps;
    const loc: Loc | null = demo && ovr ? { ...ovr, accuracy_m: 8, source: "override" }
      : pin ? { ...pin, accuracy_m: 10, source: "pin" }
      : live ? live
      : demo ? { ...DEMO_LOCATION, accuracy_m: 10, source: "demo" }
      : null;
    const status: LocStatus = gps ? "gps" : failed ? "denied" : "locating";
    const centre = pin ?? (demo && ovr ? ovr : null) ?? lastGps;
    return {
      loc, status, demoOn: demo,
      mapCenter: centre ? { ...centre, wide: false } : { ...KC, wide: true },
      setPin: (lat, lng) => { setPinState({ lat, lng }); setOvr(null); ss.del("cf_loc"); },
      override: (lat, lng) => { setDemo(true); setOvr({ lat, lng }); setPinState(null); ss.set("cf_demo", "1"); ss.set("cf_loc", JSON.stringify({ lat, lng })); },
      clearOverride: () => { setDemo(false); setOvr(null); setPinState(null); ss.del("cf_loc"); ss.del("cf_demo"); },
      retry,
      useMyLocation: () => { setPinState(null); retry(); },
    };
  }, [gps, lastGps, pin, ovr, failed, demo, retry]);

  return <LocCtx.Provider value={value}>{children}</LocCtx.Provider>;
}
