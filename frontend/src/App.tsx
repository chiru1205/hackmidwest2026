import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { AppHeader, sectionOf, type Section } from "./components/shell/AppHeader";
import { ThemeScope, ToastProvider, type Theme } from "./components/ui";
import Citizen from "./citizen/Citizen";
import Ops from "./ops/Ops";
import Vendor from "./vendor/Vendor";
import WorkflowPage from "./workflow/WorkflowPage";
import Kit from "./components/shell/Kit";

/** Every section uses the one light theme. */
export const SECTION_THEME: Record<Section, Theme> = { citizen: "light", vendor: "light", ops: "light", workflow: "light" };

export default function App() {
  const location = useLocation();
  const section = sectionOf(location.pathname);
  const theme = SECTION_THEME[section];

  // Keep <html> in sync so the body background and overscroll match the page theme.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#F4F6FA");
  }, [theme]);

  return (
    <MotionConfig reducedMotion="user">
      <ThemeScope theme={theme} className="app-shell">
        <ToastProvider>
          <AppHeader />
          <main className="app-main" id="main">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={section}
                className="app-route"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              >
                <Routes location={location}>
                  <Route path="/ops" element={<Ops />} />
                  <Route path="/vendor" element={<Vendor />} />
                  <Route path="/workflow" element={<WorkflowPage />} />
                  {import.meta.env.DEV && <Route path="/__kit" element={<Kit />} />}
                  <Route path="/*" element={<Citizen />} />
                </Routes>
              </motion.div>
            </AnimatePresence>
          </main>
        </ToastProvider>
      </ThemeScope>
    </MotionConfig>
  );
}
