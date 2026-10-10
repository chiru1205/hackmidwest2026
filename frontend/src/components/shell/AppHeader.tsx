import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { HardHat, Menu, Radar, Smartphone, Workflow } from "lucide-react";
import { MOCK } from "../../lib/api";
import { IconButton } from "../ui/Button";
import { Popover } from "../ui/Overlay";
import { Pill } from "../ui/Pill";
import { spring } from "../ui/motion";
import { HealthIndicator } from "./HealthIndicator";
import { LogoMark, Wordmark } from "./Logo";

export type Section = "citizen" | "ops" | "vendor" | "workflow";
export const sectionOf = (pathname: string): Section =>
  pathname.startsWith("/ops") ? "ops" : pathname.startsWith("/vendor") ? "vendor" : pathname.startsWith("/workflow") ? "workflow" : "citizen";

const TABS: { id: Section; label: string; to: string; icon: typeof Radar }[] = [
  { id: "citizen", label: "Citizen", to: "/", icon: Smartphone },
  { id: "ops", label: "Ops", to: "/ops", icon: Radar },
  { id: "vendor", label: "Vendor", to: "/vendor", icon: HardHat },
  { id: "workflow", label: "Workflow", to: "/workflow", icon: Workflow },
];

export function AppHeader() {
  const { pathname, search } = useLocation();
  const section = sectionOf(pathname);
  const to = (t: (typeof TABS)[number]) => (t.id === "citizen" ? { pathname: "/", search } : { pathname: t.to });

  return (
    <header className="app-header" data-section={section}>
      <div className="app-header__in">
        <NavLink to={{ pathname: "/", search }} className="app-brand" aria-label="Civic Flow home">
          <LogoMark size={32} />
          <Wordmark />
        </NavLink>
        {MOCK && <Pill variant="P3" size="sm" mono>MOCK</Pill>}

        <nav className="app-nav" aria-label="Switch view">
          {TABS.map((t) => {
            const on = t.id === section;
            const Icon = t.icon;
            return (
              <NavLink key={t.id} to={to(t)} className={`app-nav__tab ${on ? "is-on" : ""}`} aria-current={on ? "page" : undefined}>
                {on && <motion.span layoutId="app-nav-ind" className="app-nav__ind" transition={spring.snappy} />}
                <span className="app-nav__content"><Icon aria-hidden />{t.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="app-header__right">
          <HealthIndicator />
          <span className="app-menu">
            <Popover
              label="Switch view"
              trigger={({ toggle, ref, ...aria }) => (
                <IconButton ref={ref} icon={<Menu />} label="Switch view" onClick={toggle} {...aria} />
              )}
            >
              {(close) => (
                <nav className="app-menu__list" aria-label="Switch view">
                  {TABS.map((t) => {
                    const Icon = t.icon;
                    return (
                      <NavLink key={t.id} to={to(t)} onClick={close} className={`app-menu__item ${t.id === section ? "is-on" : ""}`}>
                        <Icon aria-hidden />{t.label}
                      </NavLink>
                    );
                  })}
                </nav>
              )}
            </Popover>
          </span>
        </div>
      </div>
    </header>
  );
}
