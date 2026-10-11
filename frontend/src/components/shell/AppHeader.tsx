import { NavLink, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Building2, HardHat, LogOut, Menu, Radar, TrendingUp, Workflow } from "lucide-react";
import { MOCK } from "../../lib/api";
import { ROLE, lockStaff } from "../../lib/auth";
import { IconButton } from "../ui/Button";
import { Popover } from "../ui/Overlay";
import { Pill } from "../ui/Pill";
import { spring } from "../ui/motion";
import { HealthIndicator } from "./HealthIndicator";
import { LogoMark, Wordmark } from "./Logo";

export type Section = "citizen" | "ops" | "vendor" | "workflow" | "impact" | "hood";
export const sectionOf = (pathname: string): Section =>
  ROLE === "citizen" ? "citizen"
    : pathname.startsWith("/vendor") ? "vendor" : pathname.startsWith("/workflow") ? "workflow"
    : pathname.startsWith("/impact") ? "impact" : pathname.startsWith("/under-the-hood") ? "hood" : "ops";

/** City staff navigation. The citizen app has no navigation here: it owns its tab bar. */
const TABS: { id: Section; label: string; to: string; icon: typeof Radar }[] = [
  { id: "ops", label: "Operations", to: "/ops", icon: Radar },
  { id: "vendor", label: "Vendors", to: "/vendor", icon: HardHat },
  { id: "workflow", label: "Workflow", to: "/workflow", icon: Workflow },
  { id: "impact", label: "Impact", to: "/impact", icon: TrendingUp },
];

export function AppHeader({ section }: { section: Section }) {
  const city = ROLE === "city";
  const navigate = useNavigate();
  const signOut = () => { lockStaff(); navigate("/ops", { replace: true }); };

  return (
    <header className="app-header" data-section={section} data-role={ROLE}>
      <div className="app-header__in">
        <NavLink to="/" className="app-brand" aria-label="Civic Flow home">
          <LogoMark size={32} />
          <Wordmark />
        </NavLink>
        {MOCK && <Pill variant="P3" size="sm" mono>MOCK</Pill>}
        {city && <span className="app-role-badge"><Building2 aria-hidden />City operations</span>}

        {city && (
          <nav className="app-nav" aria-label="Staff sections">
            {TABS.map((t) => {
              const on = t.id === section;
              const Icon = t.icon;
              return (
                <NavLink key={t.id} to={t.to} className={`app-nav__tab ${on ? "is-on" : ""}`} aria-current={on ? "page" : undefined}>
                  {on && <motion.span layoutId="app-nav-ind" className="app-nav__ind" transition={spring.snappy} />}
                  <span className="app-nav__content"><Icon aria-hidden />{t.label}</span>
                </NavLink>
              );
            })}
          </nav>
        )}

        {city && (
          <div className="app-header__right">
            <HealthIndicator />
            <button type="button" className="app-signout" onClick={signOut}><LogOut aria-hidden />Sign out</button>
            <span className="app-menu">
              <Popover
                label="Staff menu"
                trigger={({ toggle, ref, ...aria }) => (
                  <IconButton ref={ref} icon={<Menu />} label="Staff menu" onClick={toggle} {...aria} />
                )}
              >
                {(close) => (
                  <nav className="app-menu__list" aria-label="Staff sections">
                    {TABS.map((t) => {
                      const Icon = t.icon;
                      return (
                        <NavLink key={t.id} to={t.to} onClick={close} className={`app-menu__item ${t.id === section ? "is-on" : ""}`}>
                          <Icon aria-hidden />{t.label}
                        </NavLink>
                      );
                    })}
                    <button type="button" className="app-menu__item" onClick={() => { close(); signOut(); }}><LogOut aria-hidden />Sign out</button>
                  </nav>
                )}
              </Popover>
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
