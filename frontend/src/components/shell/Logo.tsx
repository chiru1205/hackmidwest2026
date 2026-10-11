/** Civic Flow mark: a loop (the C) that reports stream into and a check closes: from a photo to a fixed street. */
export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" className={className} role="img" aria-label="Civic Flow">
      <rect width="96" height="96" rx="26" fill="#0B1B33" />
      <circle cx="86" cy="17" r="2.6" fill="#fff" opacity=".28" />
      <circle cx="79" cy="22" r="3.2" fill="#fff" opacity=".5" />
      <circle cx="72" cy="27.5" r="3.8" fill="#fff" opacity=".78" />
      <path d="M63 33 A25 25 0 1 0 63 66" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" />
      <circle cx="66" cy="68" r="13" fill="#2457FF" stroke="#0B1B33" strokeWidth="4" />
      <path d="M59.5 68.5l4.8 4.8 8.2-9.6" fill="none" stroke="#fff" strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`app-wordmark ${className}`}>Civic<span>Flow</span></span>;
}
