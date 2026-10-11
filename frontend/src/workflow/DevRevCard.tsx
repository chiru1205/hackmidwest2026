import { ExternalLink } from "lucide-react";
import type { CaseDetail } from "../lib/api";
import { relTime } from "./format";

const STAGE_LABEL: Record<string, string> = { queued: "Queued", work_in_progress: "In progress", resolved: "Resolved" };
/** Civic Flow's own working steps are noise here; this card is about what DevRev has and what changed there. */
const HIDDEN = new Set(["report", "vision", "geofence", "dedup", "priority", "routing"]);
const SHOWN = 5;

export function DevRevCard({ d, now }: { d: CaseDetail; now: number }) {
  const r = d.devrev;
  const url = r.web_url ?? d.ticket.web_url;
  const fields: { k: string; v: string | null; mono?: boolean }[] = [
    { k: "Ticket", v: r.display_id ?? d.ticket.devrev_id, mono: true },
    { k: "Stage in DevRev", v: r.stage ? STAGE_LABEL[r.stage] ?? r.stage : null },
    { k: "Severity", v: r.severity },
    { k: "Owner", v: r.owner, mono: true },
    { k: "External ref", v: r.external_ref, mono: true },
  ];
  const shown = fields.filter((f) => f.v);
  const all = d.timeline.filter((s) => !HIDDEN.has(s.kind)).sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const steps = all.slice(-SHOWN);
  const earlier = all.length - steps.length;
  return (
    <section className="wf-dr" aria-label="In DevRev">
      <div className="wf-dr-top">
        <span className="wf-dr-badge">IN DEVREV</span>
        <span className="t-mono wf-dr-id">{r.display_id ?? d.ticket.devrev_id ?? "not synced"}</span>
        <span className="grow" />
        {url && <a className="wf-dr-open" href={url} target="_blank" rel="noopener noreferrer">Open in DevRev<ExternalLink aria-hidden /></a>}
      </div>
      {!r.synced && <p className="wf-dr-warn">This case has not reached DevRev yet. It will sync on the next pass.</p>}
      {shown.length > 0 && (
        <dl className="wf-dr-fields">
          {shown.map((f) => (
            <div key={f.k}><dt>{f.k}</dt><dd className={f.mono ? "t-mono" : ""}>{f.v}</dd></div>
          ))}
        </dl>
      )}
      <hr className="wf-dr-rule" />
      <h3 className="wf-dr-h">TIMELINE</h3>
      {steps.length === 0 ? <p className="wf-dr-warn">No activity yet.</p> : (
        <>
        {earlier > 0 && <p className="wf-dr-more">{earlier} earlier {earlier === 1 ? "event" : "events"} not shown</p>}
        <ol className="wf-dr-tl">
          {steps.map((s, i) => {
            const dev = s.source === "devrev";
            return (
              <li key={`${s.ts}-${s.kind}-${i}`}>
                <i className={dev ? "is-dev" : "is-cf"} aria-hidden />
                <span className="wf-dr-step">
                  <b>{s.title}</b>{s.detail && <span className="wf-dr-detail">{s.detail}</span>}
                  <span className="wf-dr-meta">
                    <span className={`wf-dr-src ${dev ? "is-dev" : "is-cf"}`}>{dev ? "DevRev" : "Civic Flow"}</span>
                    {relTime(s.ts, now)}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
        </>
      )}
      <p className="wf-dr-foot">Stage changes made in DevRev appear here within seconds.{r.synced && " Approving here closes the DevRev ticket."}</p>
    </section>
  );
}
