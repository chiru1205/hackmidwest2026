import type { Transition, Variants } from "framer-motion";

/** Shared spring presets. Use these instead of ad-hoc numbers. */
export const spring = {
  soft: { type: "spring", stiffness: 220, damping: 26, mass: 0.9 } as Transition,
  snappy: { type: "spring", stiffness: 420, damping: 30 } as Transition,
  pop: { type: "spring", stiffness: 520, damping: 24 } as Transition,
  slow: { type: "spring", stiffness: 90, damping: 20 } as Transition,
};

/** Staggered list: <motion.ul variants={list} initial="hidden" animate="show"><motion.li variants={item}/> */
export const list: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};
export const item: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: spring.soft },
};
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: spring.soft },
};
export const pop: Variants = {
  hidden: { opacity: 0, scale: 0.6 },
  show: { opacity: 1, scale: 1, transition: spring.pop },
};
