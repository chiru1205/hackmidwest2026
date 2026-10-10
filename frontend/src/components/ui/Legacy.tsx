/* Compatibility exports used by existing screens (citizen/ops/vendor). They are re-skinned with the
   new design system. New code should prefer the primitives (Pill, PriorityBadge, EmptyState, ...). */
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Zap } from "lucide-react";
import type { Bucket, Cluster, ClusterStatus, EdgeInfo } from "@contracts";
import { STATUS_STEPS } from "../../lib/const";
import { EmptyState, ErrorState } from "./States";
import { Pill, PriorityBadge, TicketId } from "./Pill";
import { spring } from "./motion";

export function BucketChip({ cluster }: { cluster: Pick<Cluster, "bucket" | "status" | "priority"> }) {
  if (cluster.status === "fixed") return <Pill variant="fixed" dot>Fixed</Pill>;
  return <PriorityBadge bucket={cluster.bucket} score={cluster.priority} />;
}

export const TicketChip = ({ id }: { id?: string | null }) => <TicketId id={id} />;

export function EdgeChip({ edge }: { edge?: EdgeInfo | null }) {
  if (!edge) return null;
  return (
    <Pill variant={edge.hit ? "success" : "hazard"} dot="pulse" mono title={`Cell ${edge.cell}`}>
      {edge.hit ? "Geo cache hit" : "Geo cache miss"} · {Math.round(edge.ms)} ms
    </Pill>
  );
}

export const ErrorBox = ({ msg, retry }: { msg: string; retry?: () => void }) => (
  <ErrorState message={msg} onRetry={retry} compact />
);
export const Empty = ({ children }: { children: ReactNode }) => (
  <EmptyState title={children} compact />
);

export function PriorityBar({ value, bucket }: { value: number; bucket: Bucket }) {
  return (
    <div className="pbar" role="img" aria-label={`Priority ${Math.round(value)} of 100`}>
      <motion.i
        style={{ background: `var(--${bucket.toLowerCase()})` }}
        initial={{ width: "0%" }} animate={{ width: `${Math.max(3, Math.min(100, value))}%` }} transition={spring.soft}
      />
    </div>
  );
}

/** Transit-line status stepper: Reported -> Assigned -> In progress -> Fixed. */
export function LineStepper({ status }: { status: ClusterStatus }) {
  const idx = STATUS_STEPS.findIndex((s) => s.id === status);
  const fixed = status === "fixed";
  return (
    <div className="line-stepper" role="list" aria-label={`Status: ${status}`}>
      {STATUS_STEPS.map((s, i) => {
        const done = i < idx || (fixed && i === idx);
        const now = !done && i === idx;
        return (
          <div key={s.id} role="listitem" className={`st ${done ? "done" : now ? "now" : ""}`}>
            <span className="dot">{done && <Check strokeWidth={3} aria-hidden />}</span>
            {s.label}
          </div>
        );
      })}
    </div>
  );
}

// ---------- toasts ----------
interface ToastItem { id: number; text: string; xp?: number }
const ToastCtx = createContext<(text: string, xp?: number) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
let toastId = 0;
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, xp?: number) => {
    const id = ++toastId;
    setItems((l) => [...l, { id, text, xp }]);
    setTimeout(() => setItems((l) => l.filter((x) => x.id !== id)), 3800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="ui-toasts" aria-live="polite">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id} className="ui-toast" layout
              initial={{ y: -24, opacity: 0, scale: 0.92 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ opacity: 0, y: -12, scale: 0.96 }}
              transition={spring.pop}
            >
              <span>{t.text}</span>
              {t.xp ? <span className="ui-toast__xp"><Zap aria-hidden />+{t.xp} XP</span> : null}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

export const fixedColor = "var(--success)";
