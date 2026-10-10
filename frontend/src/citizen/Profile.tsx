import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Award, Binoculars, Camera, Crown, Flame, ShieldCheck, HardHat, Lock, MapPin, Users } from "lucide-react";
import type { Badge, LeaderboardEntry } from "@contracts";
import { api } from "../lib/api";
import { useAsync } from "../lib/hooks";
import { AnimatedNumber, Avatar, EmptyState, ErrorState, Pill, ProgressRing, Skeleton, item, list, spring } from "../components/ui";
import { levelSpan } from "./common";
import { startNewCitizen } from "../lib/auth";
import { resetRequestsStore } from "./requestsStore";

const BADGE: Record<string, { icon: typeof Camera; tone: string }> = {
  first_report: { icon: Camera, tone: "blue" },
  good_neighbor: { icon: Users, tone: "green" },
  fixer: { icon: HardHat, tone: "orange" },
  streak: { icon: Flame, tone: "hazard" },
  guardian: { icon: ShieldCheck, tone: "amber" },
  watcher: { icon: Binoculars, tone: "navy" },
};

function Medallion({ b }: { b: Badge }) {
  const def = BADGE[b.id] ?? { icon: Award, tone: "blue" };
  const I = def.icon;
  const [imgOk, setImgOk] = useState(true);
  return (
    <motion.li variants={item} className={`cz-medal ${b.earned ? `is-on tone-${def.tone}` : "is-locked"} ${imgOk ? "has-art" : ""}`}>
      <span className="cz-medal__disc" aria-hidden>
        {imgOk && <span className="cz-medal__artw"><img className="cz-medal__art" src={`/badges/${b.id}.png`} alt="" loading="lazy" onError={() => setImgOk(false)} /></span>}
        {!imgOk && (b.earned ? <I size={28} strokeWidth={1.75} /> : <Lock size={22} strokeWidth={1.75} />)}
        {imgOk && !b.earned && <span className="cz-medal__lock"><Lock size={14} strokeWidth={2} /></span>}
      </span>
      <b>{b.name}</b>
      <span className="cz-medal__d">{b.description}</span>
      <span className="sr">{b.earned ? "Earned" : "Locked"}</span>
    </motion.li>
  );
}

function Podium({ top }: { top: LeaderboardEntry[] }) {
  const order = [top[1], top[0], top[2]].filter(Boolean);
  const hts: Record<number, number> = { 1: 108, 2: 80, 3: 62 };
  return (
    <div className="cz-podium">
      {order.map((r) => (
        <motion.div key={r.rank} className={`cz-pod cz-pod--${r.rank} ${r.is_you ? "is-you" : ""}`} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.soft, delay: 0.1 * (4 - r.rank) }}>
          {r.rank === 1 && <Crown className="cz-pod__crown" size={20} strokeWidth={1.75} aria-hidden />}
          <Avatar name={r.name} size={r.rank === 1 ? 56 : 46} ring />
          <b className="cz-pod__name">{r.is_you ? "You" : r.name}</b>
          <span className="cz-pod__xp t-num">{r.xp.toLocaleString("en-US")} XP</span>
          <motion.div className="cz-pod__block" initial={{ height: 0 }} animate={{ height: hts[r.rank] }} transition={{ ...spring.slow, delay: 0.25 }}>
            <span className="t-num">{r.rank}</span>
          </motion.div>
        </motion.div>
      ))}
    </div>
  );
}

export default function Profile() {
  const me = useAsync(() => api.me(), []);
  const lb = useAsync(() => api.leaderboard(), []);
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) me.reload(); }, 15000); return () => clearInterval(t); }, [me.reload]);
  const p = me.data;
  const lvl = p ? levelSpan(p.xp) : null;

  const rows = lb.data ?? [];
  const top = rows.slice(0, 3);
  const rest = rows.slice(3, 10);
  const you = rows.find((r) => r.is_you);
  const youHidden = you && you.rank > 10;

  return (
    <div className="cz-page">
      <header className="cz-head"><h1 className="cz-title">Profile</h1></header>

      {me.loading && !p && <div className="cz-stack"><Skeleton height={168} radius={20} /><Skeleton height={64} /></div>}
      {me.error && !p && <ErrorState message={me.error} onRetry={me.reload} />}
      {p && lvl && (
        <>
          <motion.section className="cz-hero" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring.soft}>
            <ProgressRing value={lvl.pct * 100} max={100} size={112} stroke={9} label={`${p.xp} XP`}>
              <span className="cz-hero__xp"><AnimatedNumber value={p.xp} /><small>XP</small></span>
            </ProgressRing>
            <div className="cz-hero__info">
              <span className="t-eyebrow">Level {lvl.index + 1}</span>
              <h2 className="cz-hero__level">{p.level}</h2>
              <span className="cz-hero__next">{p.next_level_xp > p.xp ? `${(p.next_level_xp - p.xp).toLocaleString("en-US")} XP to ${lvl.next ?? "the top"}` : "Top level reached"}</span>
              <div className="cz-hero__chips">
                <Pill variant="hazard" size="sm" icon={<Flame size={12} strokeWidth={2} aria-hidden />}>{p.streak_weeks} week streak</Pill>
                <Pill variant="neutral" size="sm" icon={<MapPin size={12} strokeWidth={2} aria-hidden />}>{p.neighborhood}</Pill>
              </div>
            </div>
          </motion.section>

          <div className="cz-stats">
            <div><AnimatedNumber value={p.reports} /><span>Reports</span></div>
            <div><AnimatedNumber value={p.confirmations} /><span>Me toos</span></div>
            <div><AnimatedNumber value={p.fixed} /><span>Fixed</span></div>
          </div>

          <section aria-labelledby="cz-badges">
            <h2 className="cz-sec" id="cz-badges">Badges <span className="cz-sec__n">{p.badges.filter((b) => b.earned).length}/{p.badges.length}</span></h2>
            <motion.ul className="cz-medals" variants={list} initial="hidden" animate="show">
              {p.badges.map((b) => <Medallion key={b.id} b={b} />)}
            </motion.ul>
          </section>
        </>
      )}

      <section className="cz-newcit" aria-label="Demo identity">
        <p className="t-caption">This device is a separate citizen with its own requests. Want a clean slate for a demo?</p>
        <button type="button" className="cz-newcit__btn" onClick={() => { startNewCitizen(); resetRequestsStore(); window.location.assign("/"); }}>Start as a new citizen</button>
      </section>

      <section aria-labelledby="cz-lb">
        <h2 className="cz-sec" id="cz-lb">Neighborhood leaderboard</h2>
        {lb.loading && !lb.data && <div className="cz-stack"><Skeleton height={170} radius={20} /><Skeleton n={3} h={52} /></div>}
        {lb.error && !lb.data && <ErrorState compact message={lb.error} onRetry={lb.reload} />}
        {lb.data && rows.length === 0 && <EmptyState compact title="No one on the board yet" description="Be the first to report and take the top spot." />}
        {rows.length > 0 && (
          <>
            <Podium top={top} />
            <motion.ol className="cz-lb" variants={list} initial="hidden" animate="show" start={4}>
              {rest.map((r) => <LbRow key={r.rank + r.name} r={r} />)}
              {youHidden && you && (<><li className="cz-lb__gap" aria-hidden>···</li><LbRow r={you} /></>)}
            </motion.ol>
          </>
        )}
      </section>
    </div>
  );
}

function LbRow({ r }: { r: LeaderboardEntry }) {
  return (
    <motion.li variants={item} className={`cz-lb__row ${r.is_you ? "is-you" : ""}`}>
      <span className="cz-lb__rank t-num">{r.rank}</span>
      <Avatar name={r.name} size={32} />
      <span className="cz-lb__who"><b>{r.is_you ? "You" : r.name}</b><small>{r.neighborhood}</small></span>
      <span className="cz-lb__xp t-num">{r.xp.toLocaleString("en-US")}<small>XP</small></span>
    </motion.li>
  );
}
