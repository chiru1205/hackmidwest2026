import { useEffect, useRef, useState } from "react";
import { NavLink, Route, Routes, useLocation, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Camera, ClipboardList, GitMerge, UserRound, Wrench, Cloud, Signal, BatteryFull, Wifi } from "lucide-react";
import type { Cluster } from "@contracts";
import { api } from "../lib/api";
import { PRESETS } from "../lib/const";
import { useAsync, useEvents } from "../lib/hooks";
import { AnimatedNumber, Skeleton, spring, useToast } from "../components/ui";
import { LocProvider, useLoc } from "./loc";
import { OverlayCtx } from "./overlay";
import Report from "./Report";
import MyReports from "./MyReports";
import Profile from "./Profile";
import "./citizen.css";

function FixedWatcher() {
  const toast = useToast();
  const mine = useRef<Set<string> | null>(null);
  const seen = useRef(new Set<string>());
  useEvents(async (e) => {
    if (e.type !== "cluster.updated") return;
    const c = e.data.cluster as Cluster | undefined;
    if (!c || c.status !== "fixed" || seen.current.has(c.id)) return;
    if (!mine.current) {
      try { mine.current = new Set((await api.myReports()).map((x) => x.id)); } catch { mine.current = new Set(); }
    }
    if (mine.current.has(c.id)) {
      seen.current.add(c.id);
      toast("Fixed! Your report is done", (e.data.points as number) || 100);
    }
  });
  return null;
}

function DemoPanel() {
  const { override, clearOverride, loc } = useLoc();
  const toast = useToast();
  return (
    <div className="cz-demo" role="region" aria-label="Demo panel">
      <strong>Demo panel</strong>
      <span className="t-caption t-mono">{loc.source} {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}</span>
      <div className="cz-demo__row">{PRESETS.map((p) => <button key={p.name} onClick={() => override(p.lat, p.lng)}>{p.name}</button>)}</div>
      <div className="cz-demo__row">
        <button onClick={clearOverride}>Use GPS</button>
        <button onClick={async () => { await api.reset(); toast("Demo reset"); window.location.reload(); }}>Reset</button>
      </div>
    </div>
  );
}

function Tabs() {
  const { search } = useLocation();
  const to = (p: string) => ({ pathname: p, search });
  const items = [
    { to: "/", label: "Report", icon: Camera, end: true },
    { to: "/mine", label: "My reports", icon: ClipboardList, end: false },
    { to: "/profile", label: "Profile", icon: UserRound, end: false },
  ];
  return (
    <nav className="cz-tabs" aria-label="Citizen tabs">
      {items.map((t) => (
        <NavLink key={t.to} to={to(t.to)} end={t.end} className={({ isActive }) => `cz-tab ${isActive ? "is-on" : ""}`}>
          {({ isActive }) => (
            <>
              {isActive && <motion.span layoutId="cz-tab-ind" className="cz-tab__ind" transition={spring.snappy} />}
              <t.icon size={22} strokeWidth={1.75} aria-hidden />
              <span>{t.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

/** Left-hand story panel on desktop: live numbers, the three-step idea, the sponsor line. */
function Story() {
  const stats = useAsync(() => api.stats(), []);
  useEvents((e) => { if (e.type === "stats.updated" && e.data.stats) stats.setData(e.data.stats); });
  const s = stats.data;
  const steps = [
    { icon: Camera, title: "Neighbors report", text: "A photo, a pin and a tap. Thousands of phones, one city." },
    { icon: GitMerge, title: "Reports converge", text: "Duplicates fold into one issue at the edge, in under a millisecond." },
    { icon: Wrench, title: "One ticket, one crew", text: "Scored, ticketed, assigned. You watch it get fixed." },
  ];
  return (
    <aside className="cz-story" aria-label="About Civic Flow">
      <div className="t-eyebrow cz-story__eyebrow">Live from Kansas City</div>
      <h1 className="cz-story__h">
        {s ? <AnimatedNumber value={s.total_reports} /> : <Skeleton width={150} height={52} />} reports
        <br />became {s ? <span className="cz-story__accent"><AnimatedNumber value={s.unique_clusters} /></span> : <Skeleton width={110} height={52} />} issues.
      </h1>
      <p className="t-body lg muted cz-story__lede">
        {s ? <>{s.duplicates_absorbed.toLocaleString("en-US")} duplicate reports were folded into the ones that were already there. Every neighbor counts, and the crew only gets one ticket.</> : "Counting neighbors..."}
      </p>
      <ol className="cz-story__steps">
        {steps.map((st, i) => (
          <motion.li key={st.title} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring.soft, delay: 0.15 + i * 0.1 }}>
            <span className="cz-story__node"><st.icon size={18} strokeWidth={1.75} aria-hidden /></span>
            <div><b>{st.title}</b><span>{st.text}</span></div>
          </motion.li>
        ))}
      </ol>
      <div className="cz-story__sponsor"><Cloud size={16} strokeWidth={1.75} aria-hidden /> Powered by Akamai Cloud AI</div>
    </aside>
  );
}

export default function Citizen() {
  const [sp] = useSearchParams();
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [pathname]);

  return (
    <LocProvider>
      <OverlayCtx.Provider value={root}>
      <div className="cz">
        <Story />
        <div className="cz-phone">
          <div className="cz-screen">
            <div className="cz-status" aria-hidden>
              <span>9:41</span><i className="cz-island" />
              <span className="cz-status__r"><Signal size={14} /><Wifi size={14} /><BatteryFull size={16} /></span>
            </div>
            <div className="cz-body" ref={scroller}>
              <Routes>
                <Route index element={<Report />} />
                <Route path="mine" element={<MyReports />} />
                <Route path="profile" element={<Profile />} />
                <Route path="*" element={<Report />} />
              </Routes>
            </div>
            <Tabs />
            <div className="cz-overlay-root" ref={setRoot} />
          </div>
        </div>
        <FixedWatcher />
        {sp.get("demo") === "1" && <DemoPanel />}
      </div>
      </OverlayCtx.Provider>
    </LocProvider>
  );
}
