import { useId, type ReactNode } from "react";
import { motion } from "framer-motion";
import { spring } from "./motion";

export interface SegmentOption<T extends string> { value: T; label: ReactNode; icon?: ReactNode; count?: number; }

/** Pill-shaped switcher with a sliding thumb. */
export function SegmentedControl<T extends string>({ options, value, onChange, size = "md", block, label }: {
  options: SegmentOption<T>[]; value: T; onChange: (v: T) => void; size?: "sm" | "md"; block?: boolean; label?: string;
}) {
  const id = useId();
  return (
    <div className={`ui-seg ui-seg--${size} ${block ? "ui-seg--block" : ""}`} role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value} type="button" role="radio" aria-checked={on}
            className={`ui-seg__opt ${on ? "is-on" : ""}`}
            onClick={() => onChange(o.value)}
          >
            {on && <motion.span layoutId={`seg-${id}`} className="ui-seg__thumb" transition={spring.snappy} />}
            <span className="ui-seg__content">
              {o.icon}{o.label}
              {o.count != null && <span className="ui-seg__count">{o.count}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
