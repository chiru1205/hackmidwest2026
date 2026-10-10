import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppHeader, sectionOf } from "../components/shell/AppHeader";
import Ops from "../ops/Ops";
import Vendor from "../vendor/Vendor";
import WorkflowPage from "../workflow/WorkflowPage";
import Kit from "../components/shell/Kit";
import { isStaffUnlocked } from "../lib/auth";
import Gate from "./Gate";

/** City staff app: PIN gate, then Operations / Vendors / Workflow. */
export default function CityApp() {
  const [unlocked, setUnlocked] = useState(isStaffUnlocked);
  const { pathname } = useLocation();
  useEffect(() => {
    const on = () => setUnlocked(false);
    window.addEventListener("cf-locked", on);
    return () => window.removeEventListener("cf-locked", on);
  }, []);

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
            {import.meta.env.DEV && <Route path="/__kit" element={<Kit />} />}
            <Route path="*" element={<Navigate to="/ops" replace />} />
          </Routes>
        </div>
      </main>
    </>
  );
}
