import { createContext, useContext, type ReactNode } from "react";

export type Theme = "light" | "dark";
const ThemeCtx = createContext<Theme>("light");
export const useTheme = () => useContext(ThemeCtx);

/** Sets data-theme on a wrapper so tokens switch for the whole subtree (portals re-apply it). */
export function ThemeScope({ theme, children, className = "", style }: { theme: Theme; children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <ThemeCtx.Provider value={theme}>
      <div data-theme={theme} className={className} style={style}>{children}</div>
    </ThemeCtx.Provider>
  );
}
export const ThemeProvider = ThemeCtx.Provider;
