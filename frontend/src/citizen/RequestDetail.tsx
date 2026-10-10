import { Link, useLocation, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, CalendarClock, HardHat, MapPin, ShieldAlert, Sparkles, Users } from "lucide-react";
import { timeAgo } from "../lib/const";
import { ErrorState, PriorityBadge, Skeleton, SkeletonText, TicketId, item, list } from "../components/ui";
import { CatIcon, Photo } from "./common";
import { StageStepper } from "./stages";
import { districtLabel, neighborsLine } from "./Requests";
import { type CitizenRequest } from "./requestsApi";
import { useMyRequest } from "./requestsStore";
import { YourReport, fmtWhen } from "./YourReport";

const fmtDue = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};
const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

export function detectedLine(r: Pick<CitizenRequest, "detected">): string {
  const d = r.detected;
  const cat = (d.category || "issue").replace(/_/g, " ");
  const sev = d.severity != null ? ` Severity ${d.severity} of 5.` : "";
  const haz = d.hazard_description ? ` ${d.hazard_description}` : d.is_hazard ? " It looks like a safety hazard." : "";
  return `Our system read your photo and saw: ${cat}.${sev}${haz}`;
}

export default function RequestDetail() {
  const { id = "" } = useParams();
  const { search } = useLocation();
  const { data: r, error, loading, reload } = useMyRequest(id, 5000);

  return (
    <div className="cz-page cz-rd">
      <Link to={{ pathname: "/requests", search }} className="cz-back"><ArrowLeft size={16} strokeWidth={1.75} aria-hidden /> My requests</Link>
      {loading && !r && <div className="cz-stack" aria-busy="true"><Skeleton height={220} radius={20} /><SkeletonText lines={3} /></div>}
      {error && !r && <ErrorState message={error} onRetry={reload} />}
      {r && (
        <motion.div className="cz-rd__stack" variants={list} initial="hidden" animate="show">
          <motion.div variants={item}>
            <Photo src={r.photo_url} cat={r.category} className="cz-rd__photo" alt={r.title}>
              {r.my_photo_url && r.issue_photo_url && r.issue_photo_url !== r.my_photo_url && (
                <span className="cz-rd__issue"><i style={{ backgroundImage: `url(${r.issue_photo_url})` }} />Issue photo</span>
              )}
            </Photo>
          </motion.div>

          <motion.header variants={item} className="cz-rd__head">
            <span className="cz-rd__eyebrow"><CatIcon cat={r.category} size={14} /> {r.category.replace(/_/g, " ")}</span>
            <h1 className="cz-rd__title">{r.title}</h1>
            <div className="cz-rd__meta">
              <span className={`cz-spill is-${r.status}`}>{r.stage_label}</span>
              <PriorityBadge bucket={r.priority_bucket} size="sm" />
              {r.ticket_id && <TicketId id={r.ticket_id} />}
            </div>
          </motion.header>

          <motion.div variants={item}><YourReport r={r} /></motion.div>

          <motion.section variants={item} className="cz-card cz-rd__card" aria-label="Progress">
            <StageStepper status={r.status} />
            <div className="cz-rd__crew">
              <span><HardHat size={16} strokeWidth={1.75} aria-hidden /> {r.crew ? <b>{r.crew}</b> : "Waiting for a crew"}</span>
              {r.due && <span><CalendarClock size={16} strokeWidth={1.75} aria-hidden /> {r.status === "fixed" ? "Target was" : "Target"} {fmtDue(r.due)}</span>}
            </div>
          </motion.section>

          <motion.section variants={item} className="cz-card cz-rd__card" aria-label="What we detected">
            <h2 className="cz-rd__h"><Sparkles size={15} strokeWidth={1.75} aria-hidden /> What we detected</h2>
            <p className="cz-rd__p">{detectedLine(r)}</p>
          </motion.section>

          <motion.section variants={item} className="cz-card cz-rd__card" aria-label="Where">
            <h2 className="cz-rd__h"><MapPin size={15} strokeWidth={1.75} aria-hidden /> Where</h2>
            <p className="cz-rd__p">{[r.address, r.neighborhood && !(r.address ?? "").includes(r.neighborhood) ? r.neighborhood : null, districtLabel(r.district)].filter(Boolean).join(" · ") || "Kansas City"}</p>
            {r.zones.length > 0 && (
              <div className="cz-zones">{r.zones.map((z) => <span key={z} className="cz-zone"><ShieldAlert size={13} strokeWidth={2} aria-hidden /> {z}</span>)}</div>
            )}
            <p className="cz-rd__neigh"><Users size={15} strokeWidth={1.75} aria-hidden /> {neighborsLine(r.neighbors)}</p>
          </motion.section>

          {r.rationale && (
            <motion.section variants={item} className="cz-card cz-rd__card" aria-label="Why this priority">
              <h2 className="cz-rd__h">Why this priority</h2>
              <p className="cz-rd__p">{r.rationale}</p>
            </motion.section>
          )}

          <motion.section variants={item} className="cz-card cz-rd__card" aria-label="Timeline">
            <h2 className="cz-rd__h">Timeline</h2>
            <ol className="cz-timeline">
              {r.timeline.map((t, i) => (
                <li key={i}>
                  <span className={`cz-timeline__dot ${i === r.timeline.length - 1 ? "is-last" : ""}`} />
                  <div><b>{t.label}</b><span>{t.detail}</span></div>
                  <time>{fmtWhen(t.ts) || fmtTime(t.ts)}<br />{timeAgo(t.ts)}</time>
                </li>
              ))}
            </ol>
          </motion.section>
        </motion.div>
      )}
    </div>
  );
}
