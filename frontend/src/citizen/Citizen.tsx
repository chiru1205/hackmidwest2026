import { useEffect, useRef, useState } from "react";
import { matchPath, Navigate, NavLink, useLocation, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Camera, ClipboardList, GitMerge, UserRound, Wrench, Cloud, Signal, BatteryFull, Wifi } from "lucide-react";
import { api } from "../lib/api";
import { PRESETS } from "../lib/const";
import { useAsync } from "../lib/hooks";
import { Skeleton, SkeletonText, spring } from "../components/ui";
import { LocProvider, useLoc } from "./loc";
import { OverlayCtx } from "./overlay";
import Report from "./Report";
import Requests from "./Requests";
import RequestDetail from "./RequestDetail";
import { useFixedToasts, useMyRequests } from "./requestsApi";
import Profile from "./Profile";
import "./citizen.css";

function FixedWatcher() {
  const { data } = useMyRequests(5000);
  useFixedToasts(data);
  return null;
}

function DemoPanel() {
  const { override, clearOverride, loc } = useLoc();
  return (
    <div className="cz-demo" role="region" aria-label="Demo panel">
      <strong>Demo panel</strong>
      <span className="t-caption t-mono">{loc.source} {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}</span>
      <div className="cz-demo__row">{PRESETS.map((p) => <button key={p.name} onClick={() => override(p.lat, p.lng)}>{p.name}</button>)}</div>
      <div className="cz-demo__row">
        <button onClick={clearOverride}>Use GPS</button>
      </div>
    </div>
  );
}

function Tabs() {
  const { search } = useLocation();
  const to = (p: string) => ({ pathname: p, search });
  const items = [
    { to: "/", label: "Report", icon: Camera, end: true },
    { to: "/requests", label: "My requests", icon: ClipboardList, end: false },
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
  const impact = useAsync(() => api.impact(), []);
  const s = impact.data;
  const steps = [
    { icon: Camera, title: "Neighbors report", text: "A photo, a pin and a tap. Potholes, lights, flooding, anything." },
    { icon: GitMerge, title: "Reports converge", text: "Duplicates fold into one issue, matched by place and by meaning." },
    { icon: Wrench, title: "One ticket, one crew", text: "Scored, ticketed, assigned. You watch it get fixed." },
  ];
  return (
    <aside className="cz-story" aria-label="About Civic Flow">
      <div className="t-eyebrow cz-story__eyebrow">Live from Kansas City</div>
      <h1 className="cz-story__h">
        {s ? s.headline : <Skeleton width={260} height={52} />}
      </h1>
      <div className="t-body lg muted cz-story__lede">
        {s ? s.facts.slice(0, 3).map((f) => <p key={f.label} style={{ margin: "0 0 6px" }}><b>{f.value}</b> {f.label.toLowerCase()}{f.estimate ? " (estimate)" : ""}</p>) : <SkeletonText lines={2} />}
      </div>
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

/** Path-based screen switch (the shell mounts this component on several absolute paths, so nested relative routes would not match). */
function Screen() {
  const { pathname, search } = useLocation();
  const detail = matchPath("/requests/:id", pathname);
  if (detail) return <RequestDetail />;
  if (pathname.startsWith("/requests")) return <Requests />;
  if (pathname === "/mine") return <Navigate to={{ pathname: "/requests", search }} replace />;
  if (pathname.startsWith("/profile")) return <Profile />;
  return <Report />;
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
              <Screen />
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
