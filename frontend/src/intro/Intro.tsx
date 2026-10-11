import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import "./intro.css";

/** The opening title card for the demo: the mark draws itself, then "Snap. Route. Fixed." Space, Enter or a click begins. */
export default function Intro({ onStart }: { onStart: () => void }) {
  const reduced = !!useReducedMotion();

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter" || e.key === "ArrowRight") { e.preventDefault(); onStart(); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [onStart]);

  // every delay below is skipped under prefers-reduced-motion: the whole card is simply there
  const t = (delay: number, duration = 0.5) => (reduced ? { duration: 0 } : { delay, duration, ease: [0.22, 1, 0.36, 1] as const });
  const show = (delay: number) => ({
    initial: reduced ? false : { opacity: 0, y: 14 } as const,
    animate: { opacity: 1, y: 0 },
    transition: t(delay),
  });

  return (
    <main className="intro" aria-label="Civic Flow" onClick={onStart}>
      <motion.svg className="intro-mark" viewBox="0 0 96 96" role="img" aria-label="Civic Flow logo"
        initial={reduced ? false : { scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 140, damping: 16 }}>
        <rect width="96" height="96" rx="26" fill="#0B1B33" />
        {[[86, 17, 2.6, 0.28, 0.9], [79, 22, 3.2, 0.5, 0.8], [72, 27.5, 3.8, 0.78, 0.7]].map(([cx, cy, r, o, d]) => (
          <motion.circle key={cx} cx={cx} cy={cy} r={r} fill="#fff" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: o }} transition={t(d as number, 0.4)} />
        ))}
        <motion.path d="M63 33 A25 25 0 1 0 63 66" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round"
          initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={t(0.25, 0.9)} />
        <motion.g initial={reduced ? false : { scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          style={{ transformOrigin: "66px 68px" }}
          transition={reduced ? { duration: 0 } : { delay: 1.1, type: "spring", stiffness: 300, damping: 14 }}>
          <circle cx="66" cy="68" r="13" fill="#2457FF" stroke="#0B1B33" strokeWidth="4" />
          <motion.path d="M59.5 68.5l4.8 4.8 8.2-9.6" fill="none" stroke="#fff" strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round"
            initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={t(1.25, 0.35)} />
        </motion.g>
      </motion.svg>

      <motion.h1 className="intro-word" {...show(0.6)}>Civic<span>Flow</span></motion.h1>

      <h2 className="intro-tag" aria-label="Snap. Route. Fixed.">
        <motion.span {...show(1.3)}>Snap.</motion.span>
        <motion.span {...show(1.7)}>Route.</motion.span>
        <motion.span className="is-fixed" {...show(2.1)}>Fixed.</motion.span>
      </h2>

      <motion.p className="intro-sub" {...show(2.8)}>From a resident&rsquo;s photo to a fixed street. For every local government.</motion.p>
      <motion.p className="intro-hint" {...show(3.6)}>Press Space to begin</motion.p>
    </main>
  );
}
