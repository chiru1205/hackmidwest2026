import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { IconButton } from "./Button";
import { spring } from "./motion";
import { useTheme } from "./theme";

/** Lightweight CSS tooltip. Wraps a single focusable child. */
export function Tooltip({ label, children, side = "top" }: { label: string; children: ReactNode; side?: "top" | "bottom" }) {
  const id = useId();
  return (
    <span className={`ui-tip ui-tip--${side}`} aria-describedby={id}>
      {children}
      <span role="tooltip" id={id} className="ui-tip__bubble">{label}</span>
    </span>
  );
}

/** Anchored popover. Click-outside and Esc close it. `trigger` receives props for a button. */
export function Popover({ trigger, children, align = "end", label }: {
  trigger: (p: { open: boolean; toggle: () => void; ref: React.RefObject<HTMLButtonElement>; "aria-expanded": boolean; "aria-haspopup": "dialog" }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "start" | "end";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent | TouchEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    document.addEventListener("mousedown", down); document.addEventListener("touchstart", down); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("touchstart", down); document.removeEventListener("keydown", key); };
  }, [open]);
  const close = () => setOpen(false);
  return (
    <span className="ui-pop" ref={wrap}>
      {trigger({ open, toggle: () => setOpen((o) => !o), ref: btn, "aria-expanded": open, "aria-haspopup": "dialog" })}
      <AnimatePresence>
        {open && (
          <motion.div
            className={`ui-pop__panel ui-pop__panel--${align}`} role="dialog" aria-label={label}
            initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={spring.snappy}
          >
            {typeof children === "function" ? children(close) : children}
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

/** Bottom sheet (phones) or side drawer (desktop). Rendered in a portal that re-applies the current theme. */
export function Sheet({ open, onClose, title, children, side = "bottom", width = 440, footer }: {
  open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode;
  side?: "bottom" | "right"; width?: number; footer?: ReactNode;
}) {
  const theme = useTheme();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => panel.current?.focus(), 30);
    return () => { document.removeEventListener("keydown", key); document.body.style.overflow = prev; clearTimeout(t); };
  }, [open, onClose]);

  const bottom = side === "bottom";
  return createPortal(
    <AnimatePresence>
      {open && (
        <div data-theme={theme} className="ui-sheet-root">
          <motion.div className="ui-sheet-scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div
            ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}
            className={`ui-sheet ui-sheet--${side}`}
            style={bottom ? undefined : { width: `min(${width}px, 100%)` }}
            initial={bottom ? { y: "100%" } : { x: "100%" }} animate={bottom ? { y: 0 } : { x: 0 }} exit={bottom ? { y: "100%" } : { x: "100%" }}
            transition={spring.soft}
            drag={bottom ? "y" : false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, i) => { if (bottom && (i.offset.y > 120 || i.velocity.y > 600)) onClose(); }}
          >
            {bottom && <div className="ui-sheet__grab" aria-hidden />}
            {(title || !bottom) && (
              <div className="ui-sheet__head">
                <div className="t-title">{title}</div>
                <IconButton icon={<X />} label="Close" onClick={onClose} />
              </div>
            )}
            <div className="ui-sheet__body">{children}</div>
            {footer && <div className="ui-sheet__foot">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
