import { Navigate, Route, Routes } from "react-router-dom";
import { AppHeader } from "./AppHeader";
import Citizen from "../../citizen/Citizen";

/** Citizen app: calm header, then the phone-first experience (it owns its Report / My requests / Profile tab bar and sub-routes). */
export default function CitizenApp() {
  return (
    <>
      <AppHeader section="citizen" />
      <main className="app-main" id="main">
        <div className="app-route">
          <Routes>
            <Route path="/" element={<Citizen />} />
            <Route path="/requests" element={<Citizen />} />
            <Route path="/requests/:id" element={<Citizen />} />
            <Route path="/profile" element={<Citizen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </>
  );
}
