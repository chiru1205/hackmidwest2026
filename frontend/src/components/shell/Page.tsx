import type { ReactNode } from "react";
import { ThemeScope, useTheme, type Theme } from "../ui/theme";

export interface PageProps {
  /** Override the theme of this page. Normally inherited from the route (all sections are light). */
  theme?: Theme;
  /** Content max width: narrow 480 (phone column), default 960, wide 1280, full = edge to edge. */
  width?: "narrow" | "default" | "wide" | "full";
  /** Fill exactly the viewport below the header, no page scroll (maps, dashboards). */
  fill?: boolean;
  /** Remove the default vertical/horizontal padding. */
  bleed?: boolean;
  className?: string;
  children: ReactNode;
}

/** Consistent page container: themed background, gutters, max width. Every screen renders inside one. */
export function Page({ theme, width = "default", fill, bleed, className = "", children }: PageProps) {
  const inherited = useTheme();
  const body = (
    <div className={`app-page app-page--${width} ${fill ? "is-fill" : ""} ${bleed ? "is-bleed" : ""} ${className}`}>
      {children}
    </div>
  );
  if (!theme || theme === inherited) return body;
  return <ThemeScope theme={theme} className="app-page-theme">{body}</ThemeScope>;
}
