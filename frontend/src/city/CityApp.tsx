import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AppHeader, sectionOf } from "../components/shell/AppHeader";
import Ops from "../ops/Ops";
import Vendor from "../vendor/Vendor";
import WorkflowPage from "../workflow/WorkflowPage";
import ImpactPage from "../impact/ImpactPage";
import UnderTheHood from "../impact/UnderTheHood";
import Kit from "../components/shell/Kit";
import { isStaffUnlocked } from "../lib/auth";
import Gate from "./Gate";
import Intro from "../intro/Intro";

/** City staff app: PIN gate, then Operations / Vendors / Workflow / Impact. /under-the-hood is a judges' page, linked from the Ops footer only. */
export default function CityApp() {
  const [unlocked, setUnlocked] = useState(isStaffUnlocked);
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const [intro, setIntro] = useState(() => new URLSearchParams(window.location.search).get("intro") === "1" || window.location.pathname === "/intro");
  useEffect(() => {
    const on = () => setUnlocked(false);
    window.addEventListener("cf-locked", on);
    return () => window.removeEventListener("cf-locked", on);
  }, []);

  // Alt+I shows the demo opener over whatever is on screen (it needs the PIN first, so the live app shows through)
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.altKey && e.key.toLowerCase() === "i") { e.preventDefault(); setIntro(true); } };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
  const closeIntro = () => {
    setIntro(false);
    if (pathname === "/intro" || search.includes("intro=1")) navigate("/ops", { replace: true });
  };

  if (!unlocked) return <Gate onUnlock={() => setUnlocked(true)} />;
  return (
    <>
      {intro && <Intro onDone={closeIntro} />}
      <AppHeader section={sectionOf(pathname)} />
      <main className="app-main" id="main">
        <div className="app-route">
          <Routes>
            <Route path="/ops" element={<Ops />} />
            <Route path="/intro" element={<Navigate to="/ops?intro=1" replace />} />
            <Route path="/vendor" element={<Vendor />} />
            <Route path="/workflow" element={<WorkflowPage />} />
            <Route path="/impact" element={<ImpactPage />} />
            <Route path="/under-the-hood" element={<UnderTheHood />} />
            {import.meta.env.DEV && <Route path="/__kit" element={<Kit />} />}
            <Route path="*" element={<Navigate to="/ops" replace />} />
          </Routes>
        </div>
      </main>
    </>
  );
}
