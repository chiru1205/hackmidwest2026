import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, HardHat, PartyPopper, Users } from "lucide-react";
import type { Cluster } from "@contracts";
import { api } from "../lib/api";
import { catLabel, timeAgo } from "../lib/const";
import { useAsync, useEvents } from "../lib/hooks";
import { Button, buttonClass, EmptyState, ErrorState, PriorityBadge, Sheet, Skeleton, SkeletonText, TicketId, StatusBadge, item, list, spring } from "../components/ui";
import { CatIcon, Photo, RouteStepper, photoFor, shortAddr } from "./common";

export default function MyReports() {
  const { search } = useLocation();
  const { data, error, loading, reload, setData } = useAsync(() => api.myReports(), []);
  const [open, setOpen] = useState<string | null>(null);
  const [flash, setFlash] = useState<Record<string, number>>({});
  const dataRef = useRef<Cluster[] | null>(null);
  dataRef.current = data;

  // live status changes from the SSE stream
  useEvents((e) => {
    if (e.type !== "cluster.updated" && e.type !== "cluster.merged") return;
    const c = e.data.cluster as Cluster | undefined;
    const cur = dataRef.current;
    if (!c || !cur || !cur.some((x) => x.id === c.id)) return;
    const prev = cur.find((x) => x.id === c.id)!;
    setData(cur.map((x) => (x.id === c.id ? c : x)));
    if (prev.status !== c.status) setFlash((f) => ({ ...f, [c.id]: Date.now() }));
  });
  useEffect(() => {
    const ids = Object.keys(flash);
    if (!ids.length) return;
    const t = setTimeout(() => setFlash({}), 2600);
    return () => clearTimeout(t);
  }, [flash]);

  const fixedCount = data?.filter((c) => c.status === "fixed").length ?? 0;

  return (
    <div className="cz-page">
      <header className="cz-head">
        <div>
          <h1 className="cz-title">My reports</h1>
          {data && data.length > 0 && <p className="cz-subtle">{data.length} {data.length === 1 ? "issue" : "issues"} followed{fixedCount ? ` · ${fixedCount} fixed` : ""}</p>}
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
          title="No reports yet"
          description="Spot a pothole or a broken light and it will show up here, with its status and crew."
          action={<Link to={{ pathname: "/", search }} className={buttonClass("primary", "md")}>Report an issue</Link>}
        />
      )}
      {data && data.length > 0 && (
        <motion.ul className="cz-stack" variants={list} initial="hidden" animate="show">
          {data.map((c) => {
            const flashed = flash[c.id];
            return (
              <motion.li key={c.id} variants={item} layout transition={spring.soft}>
                <motion.button type="button" className={`cz-rcard ${c.status === "fixed" ? "is-fixed" : ""} ${flashed ? "is-flash" : ""}`} onClick={() => setOpen(c.id)}
                  whileTap={{ scale: 0.985 }} aria-label={`${catLabel(c.category)}, ${c.status}. Open details`}>
                  <Photo src={photoFor(c)} cat={c.category} className="cz-rcard__photo">
                    <span className="cz-rcard__scrim" aria-hidden />
                    <span className="cz-rcard__tags"><PriorityBadge bucket={c.bucket} size="sm" solid />{c.ticket_id && <TicketId id={c.ticket_id} />}</span>
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
                        <b>{catLabel(c.category)}</b>
                        <span>{shortAddr(c.address) || c.neighborhood || "Nearby"}</span>
                      </div>
                      <time className="cz-rcard__time">{timeAgo(c.first_reported_at)}</time>
                    </div>
                    <RouteStepper status={c.status} />
                    <div className="cz-rcard__foot">
                      <span><Users size={14} strokeWidth={1.75} aria-hidden /> {c.reporter_count.toLocaleString("en-US")} neighbors</span>
                      {c.vendor && <span><HardHat size={14} strokeWidth={1.75} aria-hidden /> {c.vendor}</span>}
                    </div>
                  </div>
                </motion.button>
              </motion.li>
            );
          })}
        </motion.ul>
      )}
      <Sheet open={!!open} onClose={() => setOpen(null)} title="Report details" footer={<Button block variant="secondary" onClick={() => setOpen(null)}>Close</Button>}>
        {open && <Detail id={open} />}
      </Sheet>
    </div>
  );
}

function Detail({ id }: { id: string }) {
  const { data, error, loading, reload } = useAsync(() => api.cluster(id), [id]);
  if (loading && !data) return <div className="cz-stack"><Skeleton height={140} /><SkeletonText lines={3} /></div>;
  if (error) return <ErrorState compact message={error} onRetry={reload} />;
  if (!data) return null;
  const c = data.cluster;
  return (
    <div className="cz-detail">
      <Photo src={photoFor(c)} cat={c.category} className="cz-detail__photo" />
      <div className="cz-detail__row">
        <h3 className="t-title">{catLabel(c.category)}</h3>
        <StatusBadge status={c.status} />
      </div>
      <RouteStepper status={c.status} />
      <div className="cz-detail__meta">
        <PriorityBadge bucket={c.bucket} score={c.priority} />
        <TicketId id={data.ticket?.id ?? c.ticket_id} />
        {c.vendor && <span className="cz-detail__vendor"><HardHat size={14} strokeWidth={1.75} aria-hidden /> {c.vendor}</span>}
      </div>
      {c.rationale && <p className="t-body muted">{c.rationale}</p>}
      <ol className="cz-timeline">
        {data.timeline.map((t, i) => (
          <li key={i}><span className="cz-timeline__dot" /><div><b>{t.label}</b><span>{t.detail}</span></div><time>{timeAgo(t.ts)}</time></li>
        ))}
      </ol>
    </div>
  );
}
