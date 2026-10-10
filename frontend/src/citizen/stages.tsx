import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { spring } from "../components/ui";
import { STAGES, STAGE_INDEX } from "./requestsApi";

const SHORT = ["Reported", "Crew assigned", "In progress", "Verifying", "Fixed"];

/** Five-station transit line: Reported > Crew assigned > Work in progress > Awaiting verification > Fixed. */
export function StageStepper({ status, compact = false }: { status: string; compact?: boolean }) {
  const idx = STAGE_INDEX[status] ?? 0;
  const last = STAGES.length - 1;
  const fixed = idx === last;
  return (
    <div className={`cz-stage ${fixed ? "is-fixed" : ""} ${compact ? "is-compact" : ""}`} role="list" aria-label={`Status: ${STAGES[idx]}`}>
      <div className="cz-stage__track" aria-hidden>
        <motion.i className="cz-stage__fill" initial={false} animate={{ width: `${(idx / last) * 100}%` }} transition={spring.slow} />
      </div>
      {STAGES.map((label, i) => {
        const done = i < idx || (fixed && i === idx);
        const now = i === idx && !fixed;
        return (
          <div key={label} role="listitem" className={`cz-stage__st ${done ? "is-done" : ""} ${now ? "is-now" : ""}`}>
            <motion.span className="cz-stage__dot" initial={false} animate={{ scale: now ? 1.12 : 1 }} transition={spring.pop}>
              {done && <Check size={11} strokeWidth={3} aria-hidden />}
            </motion.span>
            <span className="cz-stage__lbl">{compact ? "" : SHORT[i]}</span>
          </div>
        );
      })}
    </div>
  );
}
