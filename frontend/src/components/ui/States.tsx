import type { CSSProperties, ReactNode } from "react";
import { Inbox, TriangleAlert } from "lucide-react";
import { Button } from "./Button";

export interface SkeletonProps {
  width?: number | string; height?: number | string; radius?: number | string; circle?: boolean;
  /** Render n stacked bars of height h (legacy API; default stack gap 12). */
  n?: number; h?: number;
  className?: string; style?: CSSProperties;
}

/** Shimmering placeholder. `<Skeleton height={120} />`, `<Skeleton circle width={40} />`, `<Skeleton n={3} h={72} />`. */
export function Skeleton({ width, height = 16, radius, circle, n, h, className = "", style }: SkeletonProps) {
  const bar = (key?: number, hh?: number) => (
    <div
      key={key}
      className={`ui-skeleton ${className}`}
      style={{ width: circle ? height : width, height: hh ?? height, borderRadius: circle ? "50%" : radius, ...style }}
      aria-hidden
    />
  );
  if (n && n > 0) {
    return (
      <div className="ui-skeleton-stack" aria-busy="true" aria-label="Loading">
        {Array.from({ length: n }, (_, i) => bar(i, h ?? 72))}
      </div>
    );
  }
  return bar();
}

export function SkeletonText({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`ui-skeleton-stack ${className}`} aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} height={12} width={i === lines - 1 ? "60%" : "100%"} />)}
    </div>
  );
}

export function EmptyState({ icon, title, description, action, compact }: {
  icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; compact?: boolean;
}) {
  return (
    <div className={`ui-empty ${compact ? "is-compact" : ""}`}>
      <div className="ui-empty__icon">{icon ?? <Inbox aria-hidden />}</div>
      <div className="ui-empty__title">{title}</div>
      {description && <div className="ui-empty__desc">{description}</div>}
      {action && <div className="ui-empty__action">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", message, onRetry, compact }: {
  title?: ReactNode; message?: ReactNode; onRetry?: () => void; compact?: boolean;
}) {
  return (
    <div className={`ui-empty ui-empty--error ${compact ? "is-compact" : ""}`} role="alert">
      <div className="ui-empty__icon"><TriangleAlert aria-hidden /></div>
      <div className="ui-empty__title">{title}</div>
      {message && <div className="ui-empty__desc">{message}</div>}
      {onRetry && <div className="ui-empty__action"><Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button></div>}
    </div>
  );
}
