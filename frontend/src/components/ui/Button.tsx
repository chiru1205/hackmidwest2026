import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon (a lucide element, e.g. <Camera />). */
  icon?: ReactNode;
  /** Trailing icon. */
  iconRight?: ReactNode;
  loading?: boolean;
  /** Stretch to the container width. */
  block?: boolean;
}

/** Class string for styling a non-button element (e.g. <a>/<NavLink>) as a button. */
export const buttonClass = (variant: ButtonVariant = "primary", size: ButtonSize = "md", block = false) =>
  `ui-btn ui-btn--${variant} ui-btn--${size}${block ? " ui-btn--block" : ""}`;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", icon, iconRight, loading, block, className = "", children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`${buttonClass(variant, size, block)} ${loading ? "is-loading" : ""} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 className="ui-spin" aria-hidden /> : icon}
      {children != null && <span className="ui-btn__label">{children}</span>}
      {!loading && iconRight}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: ReactNode;
  /** Required: accessible name (also shown as the native tooltip). */
  label: string;
  variant?: "ghost" | "secondary" | "primary" | "glass";
  size?: "sm" | "md" | "lg";
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = "ghost", size = "md", active, className = "", type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`ui-iconbtn ui-iconbtn--${variant} ui-iconbtn--${size} ${active ? "is-active" : ""} ${className}`}
      {...rest}
    >
      {icon}
    </button>
  );
});
