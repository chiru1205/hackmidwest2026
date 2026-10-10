import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, ChevronRight, HardHat, PartyPopper, Users } from "lucide-react";
import { timeAgo } from "../lib/const";
import { buttonClass, EmptyState, ErrorState, PriorityBadge, Skeleton, SkeletonText, TicketId, item, list, spring } from "../components/ui";
import { CatIcon, Photo } from "./common";
import { StageStepper } from "./stages";
import { useFixedToasts, useMyRequests } from "./requestsApi";

export const neighborsLine = (n: number) =>
  n <= 1 ? "Only you have reported this so far" : `${n.toLocaleString("en-US")} neighbors reported this`;

export const districtLabel = (d?: string | null) => (d ? (/^district/i.test(d) ? d : `District ${d}`) : null);

export default function Requests() {
  const { search } = useLocation();
  const { data, error, loading, reload } = useMyRequests(5000);
  const [flash, setFlash] = useState<Record<string, number>>({});
  const prev = useRef<Record<string, string>>({});
  useFixedToasts(data);

  // animate status changes between polls
  useEffect(() => {
    if (!data) return;
    const changed: Record<string, number> = {};
    data.forEach((r) => { if (prev.current[r.id] && prev.current[r.id] !== r.status) changed[r.id] = Date.now(); });
    prev.current = Object.fromEntries(data.map((r) => [r.id, r.status]));
    if (Object.keys(changed).length) setFlash((f) => ({ ...f, ...changed }));
  }, [data]);
  useEffect(() => {
    if (!Object.keys(flash).length) return;
    const t = setTimeout(() => setFlash({}), 2600);
    return () => clearTimeout(t);
  }, [flash]);

  const fixedCount = data?.filter((c) => c.status === "fixed").length ?? 0;

  return (
    <div className="cz-page">
      <header className="cz-head">
        <div>
          <h1 className="cz-title">My requests</h1>
          {data && data.length > 0 && <p className="cz-subtle">{data.length} {data.length === 1 ? "request" : "requests"}{fixedCount ? ` · ${fixedCount} fixed` : ""}</p>}
        </div>
      </header>

      {loading && !data && (
        <div className="cz-stack" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="cz-rcard"><Skeleton height={132} radius={0} /><div className="cz-rcard__body"><Skeleton width="55%" height={20} /><SkeletonText lines={2} /><Skeleton height={44} /></div></div>
          ))}
        </div>
      )}
      {error && !data && <ErrorState message={error} onRetry={reload} />}
      {data && data.length === 0 && (
        <EmptyState
          icon={<Camera aria-hidden />}
          title="No requests yet"
          description="Report a pothole, a broken light or anything else in the city. You can follow it here until it is fixed."
          action={<Link to={{ pathname: "/", search }} className={buttonClass("primary", "md")}>Report an issue</Link>}
        />
      )}
      {data && data.length > 0 && (
        <motion.ul className="cz-stack" variants={list} initial="hidden" animate="show">
          {data.map((c) => (
            <motion.li key={c.id} variants={item} layout transition={spring.soft}>
              <Link to={{ pathname: `/requests/${c.id}`, search }} className={`cz-rcard ${c.status === "fixed" ? "is-fixed" : ""} ${flash[c.id] ? "is-flash" : ""}`}
                aria-label={`${c.title}, ${c.stage_label}. Open details`}>
                <Photo src={c.photo_url} cat={c.category} className="cz-rcard__photo">
                  <span className="cz-rcard__scrim" aria-hidden />
                  <span className="cz-rcard__tags"><PriorityBadge bucket={c.priority_bucket} size="sm" solid />{c.ticket_id && <TicketId id={c.ticket_id} />}</span>
                  <AnimatePresence>
                    {c.status === "fixed" && (
                      <motion.span className="cz-rcard__fixed" initial={{ scale: 0, rotate: -14 }} animate={{ scale: 1, rotate: 0 }} transition={spring.pop}>
                        <PartyPopper size={14} strokeWidth={2} aria-hidden /> Fixed!
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Photo>
                <div className="cz-rcard__body">
                  <div className="cz-rcard__title">
                    <span className="cz-rcard__ic"><CatIcon cat={c.category} size={18} /></span>
                    <div>
                      <b className="cz-rcard__name">{c.title}</b>
                      <span className="cz-rcard__area">{[c.neighborhood, districtLabel(c.district)].filter(Boolean).join(" · ")}</span>
                    </div>
                    <time className="cz-rcard__time">{timeAgo(c.updated_at || c.created_at)}</time>
                  </div>
                  <div className="cz-rcard__status">
                    <motion.span key={c.status} className={`cz-spill is-${c.status}`} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.pop}>{c.stage_label}</motion.span>
                    <ChevronRight size={16} strokeWidth={1.75} className="cz-rcard__go" aria-hidden />
                  </div>
                  <StageStepper status={c.status} compact />
                  <div className="cz-rcard__foot">
                    <span><Users size={14} strokeWidth={1.75} aria-hidden /> {neighborsLine(c.neighbors)}</span>
                    {c.crew && <span><HardHat size={14} strokeWidth={1.75} aria-hidden /> {c.crew}</span>}
                  </div>
                </div>
              </Link>
            </motion.li>
          ))}
        </motion.ul>
      )}
    </div>
  );
}
