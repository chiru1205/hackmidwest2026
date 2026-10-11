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
  const { pathname } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const on = () => setUnlocked(false);
    window.addEventListener("cf-locked", on);
    return () => window.removeEventListener("cf-locked", on);
  }, []);

  // Alt+I opens the title card from anywhere (the demo opener); /intro needs no PIN because it shows no data
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.altKey && e.key.toLowerCase() === "i") { e.preventDefault(); navigate("/intro"); } };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [navigate]);

  if (pathname === "/intro") return <Intro onStart={() => navigate("/ops")} />;
  if (!unlocked) return <Gate onUnlock={() => setUnlocked(true)} />;
  return (
    <>
      <AppHeader section={sectionOf(pathname)} />
      <main className="app-main" id="main">
        <div className="app-route">
          <Routes>
            <Route path="/ops" element={<Ops />} />
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
