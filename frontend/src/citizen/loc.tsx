import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEMO_LOCATION } from "../lib/const";

export interface Loc { lat: number; lng: number; accuracy_m: number; source: "gps" | "demo" | "pin" | "override" }
interface Ctx { loc: Loc; setPin: (lat: number, lng: number) => void; override: (lat: number, lng: number) => void; clearOverride: () => void }

const LocCtx = createContext<Ctx>(null as unknown as Ctx);
export const useLoc = () => useContext(LocCtx);

const read = (): { lat: number; lng: number } | null => {
  try { const v = localStorage.getItem("cf_loc"); return v ? JSON.parse(v) : null; } catch { return null; }
};

export function LocProvider({ children }: { children: ReactNode }) {
  const [gps, setGps] = useState<Loc | null>(null);
  const [pin, setPinState] = useState<{ lat: number; lng: number } | null>(null);
  const [ovr, setOvr] = useState(read());
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!("geolocation" in navigator)) { setFailed(true); return; }
    const id = navigator.geolocation.watchPosition(
      (p) => { setFailed(false); setGps({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy_m: p.coords.accuracy, source: "gps" }); },
      () => setFailed(true),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const value = useMemo<Ctx>(() => {
    const loc: Loc = ovr ? { ...ovr, accuracy_m: 8, source: "override" }
      : pin ? { ...pin, accuracy_m: 10, source: "pin" }
      : gps && !failed ? gps
      : { ...DEMO_LOCATION, accuracy_m: 10, source: "demo" };
    return {
      loc,
      setPin: (lat, lng) => { setPinState({ lat, lng }); },
      override: (lat, lng) => { setOvr({ lat, lng }); try { localStorage.setItem("cf_loc", JSON.stringify({ lat, lng })); } catch { /* ignore */ } },
      clearOverride: () => { setOvr(null); setPinState(null); try { localStorage.removeItem("cf_loc"); } catch { /* ignore */ } },
    };
  }, [gps, pin, ovr, failed]);

  return <LocCtx.Provider value={value}>{children}</LocCtx.Provider>;
}
