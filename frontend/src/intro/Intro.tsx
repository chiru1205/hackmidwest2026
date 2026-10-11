import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Mail, Phone, Share2, Shield, Siren } from "lucide-react";
import "./intro.css";

const CHANNELS = [
  { label: "911", icon: Siren }, { label: "Police", icon: Shield }, { label: "Phone", icon: Phone },
  { label: "Email", icon: Mail }, { label: "Social media", icon: Share2 },
];
const STEP = 118; // px between chip centers: the chips slide this far (times their distance from the middle) into the logo

/** The demo opener: a short overlay on the live app. Five ways in converge into the mark, then "Hear it once. Fix it fast."
 *  Space, Enter, Escape or a click dismisses it. Under prefers-reduced-motion the finished frame is shown at once. */
export default function Intro({ onDone }: { onDone: () => void }) {
  const reduced = !!useReducedMotion();

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter" || e.key === "Escape" || e.key === "ArrowRight") { e.preventDefault(); onDone(); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [onDone]);

  const ease = [0.22, 1, 0.36, 1] as const;
  const t = (delay: number, duration = 0.45) => (reduced ? { duration: 0 } : { delay, duration, ease });
  const rise = (delay: number) => ({ initial: reduced ? false : ({ opacity: 0, y: 12 } as const), animate: { opacity: 1, y: 0 }, transition: t(delay) });

  return (
    <div className="intro-scrim" role="dialog" aria-modal="true" aria-label="Civic Flow: hear it once, fix it fast" onClick={onDone}>
      <div className="intro-card" onClick={(e) => e.stopPropagation()}>
        <div className="intro-stage" aria-hidden="true">
          <div className="intro-chips">
            {CHANNELS.map((c, i) => (
              <motion.span key={c.label} className="intro-chip"
                initial={reduced ? { opacity: 0, scale: 0.4 } : { opacity: 0, y: 14 }}
                animate={reduced ? { opacity: 0, scale: 0.4 } : { opacity: [0, 1, 1, 0], y: [14, 0, 0, 0], x: [0, 0, 0, (2 - i) * STEP], scale: [1, 1, 1, 0.35] }}
                transition={reduced ? { duration: 0 } : { delay: 0.12 * i, duration: 1.5, times: [0, 0.25, 0.62, 1], ease: "easeInOut" }}>
                <c.icon size={15} strokeWidth={2} /> {c.label}
              </motion.span>
            ))}
          </div>
          <motion.svg className="intro-mark" viewBox="0 0 96 96"
            initial={reduced ? false : { scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={reduced ? { duration: 0 } : { delay: 1.25, type: "spring", stiffness: 220, damping: 15 }}>
            <rect width="96" height="96" rx="26" fill="#0B1B33" />
            <circle cx="86" cy="17" r="2.6" fill="#fff" opacity=".28" /><circle cx="79" cy="22" r="3.2" fill="#fff" opacity=".5" /><circle cx="72" cy="27.5" r="3.8" fill="#fff" opacity=".78" />
            <path d="M63 33 A25 25 0 1 0 63 66" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" />
            <circle cx="66" cy="68" r="13" fill="#2457FF" stroke="#0B1B33" strokeWidth="4" />
            <path d="M59.5 68.5l4.8 4.8 8.2-9.6" fill="none" stroke="#fff" strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round" />
          </motion.svg>
        </div>

        <motion.div className="intro-word" {...rise(1.45)}>Civic<span>Flow</span></motion.div>
        <h2 className="intro-tag">
          <motion.span {...rise(1.7)}>Hear it once.</motion.span>
          <motion.span className="is-fast" {...rise(2.05)}>Fix it fast.</motion.span>
        </h2>
        <motion.p className="intro-sub" {...rise(2.4)}>One front door instead of 911 calls, police reports, phone calls, emails and social media.</motion.p>
        <motion.p className="intro-hint" {...rise(2.8)}>Press Space to begin</motion.p>
      </div>
    </div>
  );
}
