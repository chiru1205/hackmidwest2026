import { Camera, Clock, MapPin, MessageSquareQuote, Tag, Users } from "lucide-react";
import { catLabel } from "../lib/const";
import { districtLabel } from "./Requests";
import type { CitizenRequest } from "./requestsApi";

export const fmtWhen = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

export const oneOfLine = (n: number) => (n > 1 ? `You're one of ${n.toLocaleString("en-US")} neighbors on this issue` : null);

/** What the citizen themselves reported on this issue. */
export function YourReport({ r }: { r: CitizenRequest }) {
  const detected = r.detected.category;
  const where = [r.neighborhood, districtLabel(r.district)].filter(Boolean).join(" · ");
  const one = oneOfLine(r.neighbors);
  const mine = r.my_photo_url;
  return (
    <section className="cz-card cz-rd__card cz-yr" aria-label="Your report" data-testid="your-report">
      <h2 className="cz-rd__h"><Camera size={15} strokeWidth={1.75} aria-hidden /> Your report</h2>
      <div className="cz-yr__top">
        {mine ? <img className="cz-yr__photo" src={mine} alt="Your photo" data-testid="my-photo" /> : <span className="cz-yr__nophoto">No photo added</span>}
        <div className="cz-yr__txt">
          {r.my_note ? <p className="cz-yr__note" data-testid="my-note"><MessageSquareQuote size={14} strokeWidth={1.75} aria-hidden /> {r.my_note}</p> : <p className="cz-yr__note is-none">No note added</p>}
          {one && <p className="cz-rd__neigh" data-testid="one-of"><Users size={15} strokeWidth={1.75} aria-hidden /> {one}</p>}
        </div>
      </div>
      <dl className="cz-yr__dl">
        <div><dt><Tag size={13} strokeWidth={1.75} aria-hidden /> Category</dt>
          <dd data-testid="my-category">Identified as <b>{catLabel(detected)}</b></dd></div>
        <div><dt><MapPin size={13} strokeWidth={1.75} aria-hidden /> Where</dt>
          <dd>{[r.address, where].filter(Boolean).join(" · ") || "Kansas City"}{r.zones.length > 0 && <span className="cz-yr__zones"> · {r.zones.join(", ")}</span>}</dd></div>
        <div><dt><Clock size={13} strokeWidth={1.75} aria-hidden /> When</dt><dd>{fmtWhen(r.my_reported_at || r.created_at)}</dd></div>
        {r.detected.severity != null && <div><dt>Severity</dt><dd>Rated {r.detected.severity} of 5</dd></div>}
      </dl>
    </section>
  );
}

/** Compact version for the list card. */
export function YourReportMini({ r }: { r: CitizenRequest }) {
  const one = oneOfLine(r.neighbors);
  return (
    <div className="cz-rcard__mine">
      <b>Your report</b>
      <span>{r.my_note ? `"${r.my_note}"` : "No note"} · {catLabel(r.detected.category)}</span>
      {one && <span className="cz-rcard__one">{one}</span>}
    </div>
  );
}
