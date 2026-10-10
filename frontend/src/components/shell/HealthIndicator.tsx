import { useCallback, useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Health } from "@contracts";
import { api, MOCK } from "../../lib/api";
import { Popover } from "../ui/Overlay";
import { Pill } from "../ui/Pill";

type State = { kind: "loading" } | { kind: "ok" | "degraded"; data: Health } | { kind: "down"; error: string };

const FLAG_LABEL: Record<string, string> = {
  model_provider: "Model", agents_mode: "Agents", vision: "Vision", devrev_mode: "DevRev",
  storage: "Storage", edgekv_backend: "Edge KV", demo_mode: "Demo mode",
};

/** Live API health dot in the header. Click for services and feature flags. */
export function HealthIndicator() {
  const [s, setS] = useState<State>({ kind: "loading" });
  const load = useCallback(() => {
    api.health()
      .then((data) => setS({ kind: data.status === "ok" ? "ok" : "degraded", data }))
      .catch((e) => setS({ kind: "down", error: String(e?.message ?? e) }));
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  const label = s.kind === "ok" ? "Live" : s.kind === "degraded" ? "Degraded" : s.kind === "down" ? "Offline" : "Checking";
  return (
    <Popover
      label="System status"
      trigger={({ toggle, ref, ...aria }) => (
        <button ref={ref} type="button" className={`app-health is-${s.kind}`} onClick={() => { toggle(); load(); }} {...aria} aria-label={`System status: ${label}`}>
          <i className="app-health__dot" aria-hidden />
          <span className="app-health__label">{label}</span>
          <ChevronDown className="app-health__chev" aria-hidden />
        </button>
      )}
    >
      <div className="app-health__panel">
        <div className="app-health__head">
          <span className="t-title">System status</span>
          <Pill variant={s.kind === "ok" ? "success" : s.kind === "down" ? "P1" : "P3"} dot size="sm">{label}</Pill>
        </div>
        {s.kind === "down" && <p className="t-body muted">The API is unreachable ({s.error}). The app keeps working from cached data where it can.</p>}
        {s.kind === "loading" && <p className="t-body muted">Checking services...</p>}
        {(s.kind === "ok" || s.kind === "degraded") && (
          <>
            <div className="t-eyebrow">Services</div>
            <ul className="app-health__list">
              {Object.entries(s.data.services).map(([k, v]) => {
                const bad = /down|error|fail/i.test(v);
                return (
                  <li key={k}>
                    <i className={`app-health__dot ${bad ? "is-bad" : ""}`} aria-hidden />
                    <span>{k}</span>
                    <span className="t-mono muted">{v}</span>
                  </li>
                );
              })}
            </ul>
            <div className="t-eyebrow">Flags</div>
            <div className="app-health__flags">
              {Object.entries(s.data.flags).map(([k, v]) => (
                <Pill key={k} variant={v === true ? "primary" : "neutral"} size="sm" mono>
                  {FLAG_LABEL[k] ?? k}: {String(v)}
                </Pill>
              ))}
            </div>
          </>
        )}
        {MOCK && <p className="t-caption">Running in mock mode (no backend).</p>}
      </div>
    </Popover>
  );
}
