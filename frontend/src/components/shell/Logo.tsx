/** Civic Flow mark: two reports converge along a line into one ticket node. */
export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} role="img" aria-label="Civic Flow">
      <rect width="32" height="32" rx="9" fill="#0B1B33" />
      <g fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 9.5h3.5c3 0 4.5 1.8 4.5 4.5v2" opacity=".55" />
        <path d="M8 22.5h3.5c3 0 4.5-1.8 4.5-4.5v-2" opacity=".55" />
        <path d="M16 16h6" />
      </g>
      <circle cx="8" cy="9.5" r="2" fill="#fff" opacity=".7" />
      <circle cx="8" cy="22.5" r="2" fill="#fff" opacity=".7" />
      <circle cx="24" cy="16" r="4.2" fill="#2457FF" stroke="#fff" strokeWidth="2.2" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`app-wordmark ${className}`}>Civic<span>Flow</span></span>;
}
