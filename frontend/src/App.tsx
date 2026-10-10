import { Suspense, lazy, useEffect } from "react";
import { MotionConfig } from "framer-motion";
import { ThemeScope, ToastProvider } from "./components/ui";

// The ternary on the build-time env is folded by Vite, so each build ships only its own role's code.
const RoleApp = lazy(() =>
  import.meta.env.VITE_ROLE === "city" ? import("./city/CityApp") : import("./components/shell/CitizenApp"),
);

export default function App() {
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "light");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#F4F6FA");
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <ThemeScope theme="light" className="app-shell">
        <ToastProvider>
          <Suspense fallback={null}>
            <RoleApp />
          </Suspense>
        </ToastProvider>
      </ThemeScope>
    </MotionConfig>
  );
}
