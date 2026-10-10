import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import confetti from "canvas-confetti";
import { ArrowRight, CalendarClock, Check, ChevronDown, HardHat, HeartHandshake, ShieldAlert, Sparkles } from "lucide-react";
import type { AgentStep, Bucket, ReportResult } from "@contracts";
import { catLabel } from "../lib/const";
import { fetchMyRequest, type CitizenRequest } from "./requestsApi";
import { detectedLine } from "./RequestDetail";
import { AnimatedNumber, Button, PriorityBadge, ProgressRing, TicketId, item, list, spring, useCountUp, useReducedMotion } from "../components/ui";
import { CatIcon, areaLine, geoOf, levelSpan } from "./common";

const NODE_LABEL: Record<string, string> = { intake: "Read the photo", dedup: "Checked the map", judge: "Compared with nearby reports", priority: "Scored the priority", dispatch: "Sent to a crew" };

/** Honest step titles: name a provider only when the step's model says so. */
function stepTitle(s: AgentStep): string {
  const m = (s.model ?? "").toLowerCase();
  const base = NODE_LABEL[s.node] ?? s.node;
  if (s.status === "skipped") return base;
  if (s.node === "intake") return /bedrock|claude|anthropic/.test(m) ? "Read the photo - Claude on AWS Bedrock" : base;
  if (s.node === "judge") return /embed/.test(m) || m.startsWith("akamai") ? "Compared with nearby reports - Akamai embeddings" : base;
  if (s.node === "priority") return m.startsWith("akamai") ? "Explained the priority - Akamai AI" : base;
  return base;
}

/** Sample a quadratic bezier into keyframes. */
function bez(p0: [number, number], c: [number, number], p1: [number, number], n = 14) {
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    xs.push(u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0]);
    ys.push(u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]);
  }
  return { xs, ys, d: `M${p0[0].toFixed(1)} ${p0[1].toFixed(1)} Q${c[0].toFixed(1)} ${c[1].toFixed(1)} ${p1[0]} ${p1[1]}` };
}

/** Reports drifting along curved lines into one pin. */
function Converge({ n, merged, rejected, W, H }: { n: number; merged: boolean; rejected: boolean; W: number; H: number }) {
  const reduced = useReducedMotion();
  const CX = W / 2, CY = H / 2;
  const dots = useMemo(() => {
    if (!merged) return [];
    const count = Math.min(22, Math.max(6, n));
    return Array.from({ length: count }, (_, i) => {
      const a = i * 2.399963 + 0.4;
      const rx = W * 0.62 + (i % 4) * 22, ry = H * 0.58 + (i % 4) * 22;
      const start: [number, number] = [CX + Math.cos(a) * rx, CY + Math.sin(a) * ry];
      const side = i % 2 ? 1 : -1;
      const ctrl: [number, number] = [
        (start[0] + CX) / 2 + Math.sin(a) * 60 * side,
        (start[1] + CY) / 2 - Math.cos(a) * 60 * side,
      ];
      return { ...bez(start, ctrl, [CX, CY]), delay: 0.1 + i * 0.045, key: i };
    });
  }, [n, merged, W, H, CX, CY]);

  return (
    <svg className="cz-rv__svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ marginTop: -H / 2 }} aria-hidden>
      <defs>
        <radialGradient id="rvglow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#2457FF" stopOpacity=".22" /><stop offset="100%" stopColor="#2457FF" stopOpacity="0" />
        </radialGradient>
      </defs>
      <motion.circle cx={CX} cy={CY} r={150} fill="url(#rvglow)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1, duration: 0.8 }} />
      {!reduced && dots.map((d) => (
        <g key={d.key}>
          <motion.path d={d.d} fill="none" stroke="#2457FF" strokeWidth={1.6} strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: [0, 0.5, 0.18] }}
            transition={{ delay: d.delay, duration: 1.2, ease: "easeInOut" }} />
          <motion.circle r={5} fill="#2457FF" stroke="#fff" strokeWidth={2}
            initial={{ cx: d.xs[0], cy: d.ys[0], opacity: 0, scale: 1 }}
            animate={{ cx: d.xs, cy: d.ys, opacity: [0, 1, 1, 1, 0], scale: [1, 1, 1, 0.8, 0.2] }}
            transition={{ delay: d.delay, duration: 1.25, ease: "easeInOut", times: undefined }} />
        </g>
      ))}
      {/* shock rings when the pin lands */}
      {!rejected && [0, 1].map((i) => (
        <motion.circle key={i} cx={CX} cy={CY} fill="none" stroke="#2457FF" strokeWidth={2}
          initial={{ r: 8, opacity: 0 }} animate={{ r: 78, opacity: [0, 0.7, 0] }}
          transition={{ delay: (merged ? 1.35 : 0.5) + i * 0.22, duration: 1.1, ease: "easeOut" }} />
      ))}
      {rejected ? (
        <motion.g initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.soft} style={{ transformOrigin: `${CX}px ${CY}px` }}>
          <circle cx={CX} cy={CY} r={44} fill="#EEF2F8" stroke="#CDD6E3" strokeWidth={2} />
          <path d={`M${CX - 14} ${CY} h28 M${CX} ${CY - 14} v28`} stroke="#8A97AD" strokeWidth={3} strokeLinecap="round" transform={`rotate(45 ${CX} ${CY})`} />
        </motion.g>
      ) : (
        <motion.g initial={{ y: merged ? 0 : -140, scale: merged ? 0.2 : 1, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }}
          transition={{ ...spring.pop, delay: merged ? 1.3 : 0.15, damping: 14 }} style={{ transformOrigin: `${CX}px ${CY + 22}px` }}>
          <ellipse cx={CX} cy={CY + 24} rx={14} ry={4.5} fill="#0B1B33" opacity=".18" />
          <path d={`M${CX} ${CY + 24} C ${CX - 38} ${CY - 6}, ${CX - 34} ${CY - 46}, ${CX} ${CY - 46} S ${CX + 38} ${CY - 6}, ${CX} ${CY + 24}z`} fill="#FF5B2E" stroke="#fff" strokeWidth={3} strokeLinejoin="round" />
          <circle cx={CX} cy={CY - 20} r={10} fill="#fff" />
        </motion.g>
      )}
    </svg>
  );
}

function PriorityMeter({ before, after, bucket }: { before: number | null; after: number; bucket: Bucket }) {
  const [v, setV] = useState(before ?? 0);
  useEffect(() => { const t = setTimeout(() => setV(after), 500); return () => clearTimeout(t); }, [after]);
  const shown = useCountUp(v, 1100);
  return (
    <div className="cz-meter">
      <div className="cz-meter__top">
        <span className="t-eyebrow">Priority</span>
        <motion.span key={bucket} initial={{ scale: 1.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...spring.pop, delay: 0.5 }}>
          <PriorityBadge bucket={bucket} solid />
        </motion.span>
      </div>
      <div className="cz-meter__nums">
        {before != null && before !== after && <span className="cz-meter__from t-num">{Math.round(before)}</span>}
        {before != null && before !== after && <ArrowRight size={16} strokeWidth={1.75} aria-hidden />}
        <span className="cz-meter__to t-num">{Math.round(shown)}</span><span className="cz-meter__of">/ 100</span>
      </div>
      <div className="cz-meter__bar" role="img" aria-label={`Priority ${Math.round(after)} of 100, ${bucket}`}>
        <i style={{ left: 0, width: "35%", background: "var(--p4)" }} />
        <i style={{ left: "35%", width: "25%", background: "var(--p3)" }} />
        <i style={{ left: "60%", width: "20%", background: "var(--p2)" }} />
        <i style={{ left: "80%", width: "20%", background: "var(--p1)" }} />
        {before != null && before !== after && <span className="cz-meter__ghost" style={{ left: `${before}%` }} />}
        <motion.span className="cz-meter__mark" initial={{ left: `${before ?? 0}%` }} animate={{ left: `${v}%` }} transition={{ type: "spring", stiffness: 70, damping: 15, delay: 0.1 }} />
      </div>
      <div className="cz-meter__scale t-mono"><span>P4</span><span>P3</span><span>P2</span><span>P1</span></div>
    </div>
  );
}

export default function Reveal({ result, onClose }: { result: ReportResult; onClose: () => void }) {
  const reduced = useReducedMotion();
  const merged = result.outcome === "merged";
  const rejected = result.outcome === "rejected";
  const outside = rejected && result.reject_reason === "outside_service_area";
  const alreadyCounted = merged && result.points_awarded === 0;
  const others = Math.max(0, result.neighbors - 1);
  const c = result.cluster;
  const [why, setWhy] = useState<string | null>(c?.rationale ?? null);
  const [whyKey, setWhyKey] = useState(0);
  // the citizen's own view of this request: crew, due date, what was detected; the AI-written explanation can land a few seconds later
  const [mine, setMine] = useState<CitizenRequest | null>(null);
  useEffect(() => {
    if (!c || rejected) return;
    let live = true, n = 0;
    const load = () => fetchMyRequest(c.id).then((r) => {
      if (!live) return;
      setMine(r);
      if (r.rationale && r.rationale !== why) { setWhy(r.rationale); setWhyKey((k) => k + 1); }
    }).catch(() => undefined);
    load();
    const t = setInterval(() => { if (++n > 4) clearInterval(t); else load(); }, 3000);
    return () => { live = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.id, rejected]);
  const [stage, setStage] = useState(reduced ? 1 : 0);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 390, h: 760 });
  useLayoutEffect(() => {
    const el = root.current;
    if (el) setBox({ w: el.clientWidth || 390, h: el.clientHeight || 760 });
  }, []);
  const compact = Math.round(Math.min(210, Math.max(150, box.h * 0.2)));

  // the takeover plays for ~1.6 s before the details land
  useEffect(() => {
    if (reduced) return;
    const t = setTimeout(() => setStage(1), rejected ? 500 : merged ? 1750 : 900);
    return () => clearTimeout(t);
  }, [reduced, merged, rejected]);

  useEffect(() => {
    if (stage < 1 || reduced || rejected || result.points_awarded <= 0) return;
    const colors = ["#2457FF", "#12B981", "#F5B301", "#FF5B2E", "#7C9BFF"];
    const t = setTimeout(() => confetti({
      particleCount: merged ? 70 : 150, spread: merged ? 70 : 100, startVelocity: 38, origin: { y: 0.55 }, colors, zIndex: 300,
    }), 250);
    return () => clearTimeout(t);
  }, [stage, merged, rejected, reduced, result.points_awarded]);

  const bucket = c?.bucket ?? "P3";
  const score = result.priority_after ?? c?.priority ?? 0;
  const vendor = mine?.crew ?? result.ticket?.vendor ?? c?.vendor;
  const ticketId = result.ticket?.id ?? c?.ticket_id;
  const xpAfter = result.xp_total, xpBefore = Math.max(0, xpAfter - result.points_awarded);
  const lvl = levelSpan(xpAfter);
  const lvlBefore = levelSpan(xpBefore);
  const levelUp = lvl.index > lvlBefore.index;

  return (
    <motion.div ref={root} className="cz-rv" data-theme="light" role="dialog" aria-modal="true" aria-label="Report result"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
      <div className="cz-rv__scroll">
        <motion.div className="cz-rv__hero" initial={false} animate={{ height: stage >= 1 ? compact : box.h }} transition={{ type: "spring", stiffness: 120, damping: 22 }}>
          <Converge n={others} merged={merged} rejected={rejected} W={box.w} H={box.h} />
        </motion.div>

        <AnimatePresence>
          {stage >= 1 && (
            <motion.div className="cz-rv__content" variants={list} initial="hidden" animate="show">
              {rejected ? (
                <>
                  <motion.div variants={item} className="cz-rv__head">
                    <span className="cz-rv__eyebrow">{outside ? "Outside our service area" : "Not counted this time"}</span>
                    <h2 className="cz-rv__title">{outside ? "That spot is outside Kansas City" : "Let's try that again"}</h2>
                    <p className="cz-rv__sub">{outside ? (result.message || "Civic Flow covers Kansas City, Missouri for now. Move the pin to a spot inside the city and try again.") : (result.reject_reason ?? result.message)}</p>
                  </motion.div>
                  {outside ? (
                  <motion.ul variants={item} className="cz-rv__tips">
                    <li><Check size={16} strokeWidth={2} aria-hidden /> Drag the pin to the problem inside Kansas City, MO</li>
                    <li><Check size={16} strokeWidth={2} aria-hidden /> Check that your phone's location is accurate</li>
                  </motion.ul>
                  ) : (
                  <motion.ul variants={item} className="cz-rv__tips">
                    <li><Check size={16} strokeWidth={2} aria-hidden /> Stand close to the issue and keep it in the frame</li>
                    <li><Check size={16} strokeWidth={2} aria-hidden /> Make sure your location is on and accurate</li>
                    <li><Check size={16} strokeWidth={2} aria-hidden /> Add a short note if the photo is dark</li>
                  </motion.ul>
                  )}
                </>
              ) : (
                <>
                  <motion.div variants={item} className="cz-rv__head">
                    <span className="cz-rv__eyebrow"><CatIcon cat={c?.category ?? "other"} size={14} /> {catLabel(c?.category ?? "")}{c?.neighborhood ? ` · ${c.neighborhood}` : ""}</span>
                    {c && areaLine(c) && <span className="cz-rv__area t-caption">{areaLine(c)}</span>}
                    {merged ? (
                      alreadyCounted ? (
                        <h2 className="cz-rv__title">Already counted</h2>
                      ) : (
                        <h2 className="cz-rv__title">You + <AnimatedNumber value={others} ms={1300} className="cz-rv__big" /> {others === 1 ? "neighbor" : "neighbors"}</h2>
                      )
                    ) : (
                      <h2 className="cz-rv__title">You're the first responder</h2>
                    )}
                    <p className="cz-rv__sub">
                      {merged ? (alreadyCounted ? result.message : "Your voice joined an issue that is already on the map. One ticket, one crew.") : "A brand new issue is on the map and a ticket is on its way to a crew."}
                    </p>
                  </motion.div>

                  <motion.div variants={item} className="cz-rv__card">
                    <PriorityMeter before={result.priority_before ?? null} after={score} bucket={bucket} />
                    {why && (
                      <motion.p key={whyKey} className="cz-rv__sub cz-rv__why" initial={{ opacity: whyKey ? 0 : 1 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }} style={{ margin: "10px 0 0" }}>
                        {why}
                      </motion.p>
                    )}
                    {geoOf(c).zones.length > 0 && (
                      <div className="cz-zones cz-zones--rv">
                        {geoOf(c).zones.map((z) => <span key={z} className="cz-zone"><ShieldAlert size={13} strokeWidth={2} aria-hidden /> {z}</span>)}
                      </div>
                    )}
                    {mine && (
                      <p className="cz-rv__sub" style={{ margin: "10px 0 0" }}><Sparkles size={13} strokeWidth={1.75} aria-hidden style={{ verticalAlign: "-2px" }} /> {detectedLine(mine)}</p>
                    )}
                    <div className="cz-rv__ticket">
                      <TicketId id={ticketId} />
                      <span className="cz-rv__crew">
                        <span className="cz-rv__crewic"><HardHat size={16} strokeWidth={1.75} aria-hidden /></span>
                        <span><b>{vendor ? "Crew assigned" : "Waiting for a crew"}</b>{vendor && <em>{vendor}</em>}</span>
                      </span>
                    </div>
                    {mine?.due && (
                      <p className="cz-rv__sub" style={{ margin: "8px 0 0" }}><CalendarClock size={13} strokeWidth={1.75} aria-hidden style={{ verticalAlign: "-2px" }} /> Target {new Date(mine.due).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</p>
                    )}
                  </motion.div>

                  {(result.points_awarded > 0 || xpAfter > 0) && (
                    <motion.div variants={item} className="cz-rv__card cz-rv__xp">
                      <ProgressRing value={lvl.pct * 100} max={100} size={84} stroke={8} tone="primary" label={`Level ${lvl.name}`}>
                        <span className="cz-rv__lvl t-num">{lvl.index + 1}</span>
                      </ProgressRing>
                      <div className="cz-rv__xpinfo">
                        <div className="cz-rv__xprow">
                          <b>{lvl.name}</b>
                          {levelUp && <span className="cz-rv__levelup"><Sparkles size={12} strokeWidth={2} aria-hidden /> Level up</span>}
                        </div>
                        <XpBar from={lvlBefore.index === lvl.index ? lvlBefore.pct : 0} to={lvl.pct} />
                        <span className="cz-rv__xpnote t-mono">
                          {xpAfter.toLocaleString("en-US")} XP{lvl.next ? ` · ${(lvl.hi - xpAfter).toLocaleString("en-US")} to ${lvl.next}` : ""}
                        </span>
                      </div>
                      {result.points_awarded > 0 && (
                        <motion.span className="cz-rv__burst t-num" initial={{ scale: 0, rotate: -12 }} animate={{ scale: [0, 1.25, 1], rotate: 0 }} transition={{ delay: 0.5, duration: 0.5, ease: "easeOut" }}>
                          +{result.points_awarded} XP
                        </motion.span>
                      )}
                    </motion.div>
                  )}

                  {result.steps.length > 0 && (
                    <motion.div variants={item} className="cz-rv__how">
                      <button type="button" className="cz-rv__howbtn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                        <HeartHandshake size={16} strokeWidth={1.75} aria-hidden /> How we handled it
                        <ChevronDown size={16} strokeWidth={1.75} className={open ? "is-open" : ""} aria-hidden />
                      </button>
                      <AnimatePresence initial={false}>
                        {open && (
                          <motion.ol className="cz-rv__steps" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring.soft}>
                            {result.steps.map((s, i) => (
                              <li key={i}>
                                <span className="cz-rv__stdot" />
                                <div><b>{stepTitle(s)}</b><span>{s.summary}</span></div>
                                <em className="t-mono">{s.status === "skipped" ? "skipped" : `${Math.round(s.ms)} ms`}</em>
                              </li>
                            ))}
                          </motion.ol>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {stage >= 1 && (
        <motion.div className="cz-rv__foot" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.soft, delay: 0.5 }}>
          <Button size="lg" block onClick={onClose} autoFocus>{rejected ? "Back to the report" : "Done"}</Button>
        </motion.div>
      )}
    </motion.div>
  );
}

function XpBar({ from, to }: { from: number; to: number }) {
  return (
    <div className="cz-rv__xpbar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(to * 100)}>
      <motion.i initial={{ width: `${from * 100}%` }} animate={{ width: `${Math.max(to * 100, 3)}%` }} transition={{ type: "spring", stiffness: 60, damping: 16, delay: 0.7 }} />
    </div>
  );
}
