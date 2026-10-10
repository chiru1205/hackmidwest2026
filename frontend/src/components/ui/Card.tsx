import { forwardRef, type ElementType, type HTMLAttributes, type ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  padding?: "none" | "sm" | "md" | "lg";
  /** "glass" = translucent blurred panel for over-map UI. "flat" = hairline, no shadow. */
  tone?: "default" | "flat" | "subtle" | "glass";
  interactive?: boolean;
  selected?: boolean;
  children?: ReactNode;
}

/** 16px-radius surface with a soft layered shadow. */
export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  { as: Tag = "div", padding = "md", tone = "default", interactive, selected, className = "", children, ...rest },
  ref,
) {
  const T = Tag as ElementType;
  return (
    <T
      ref={ref}
      className={`ui-card ui-card--${tone} ui-card--pad-${padding} ${interactive ? "is-interactive" : ""} ${selected ? "is-selected" : ""} ${className}`}
      aria-pressed={Tag === "button" && selected != null ? selected : undefined}
      {...rest}
    >
      {children}
    </T>
  );
});

export function SectionHeader({ title, eyebrow, description, action, level = 2, className = "" }: {
  title: ReactNode; eyebrow?: ReactNode; description?: ReactNode; action?: ReactNode; level?: 1 | 2 | 3; className?: string;
}) {
  const H = (`h${level}`) as ElementType;
  return (
    <div className={`ui-sechead ${className}`}>
      <div className="ui-sechead__text">
        {eyebrow && <div className="t-eyebrow">{eyebrow}</div>}
        <H className={level === 1 ? "t-display" : level === 2 ? "t-title" : "ui-sechead__h3"}>{title}</H>
        {description && <p className="t-body muted">{description}</p>}
      </div>
      {action && <div className="ui-sechead__action">{action}</div>}
    </div>
  );
}

export function Divider({ label, vertical, className = "" }: { label?: ReactNode; vertical?: boolean; className?: string }) {
  if (vertical) return <span role="separator" aria-orientation="vertical" className={`ui-divider ui-divider--v ${className}`} />;
  return (
    <div role="separator" className={`ui-divider ${label ? "has-label" : ""} ${className}`}>
      {label && <span>{label}</span>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="ui-kbd">{children}</kbd>;
}
