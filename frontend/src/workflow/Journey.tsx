import type { ComponentType, SVGProps } from "react";
import {
  ArrowRight, Check, CircleDot, Construction, Footprints, Lightbulb, MapPin, Paintbrush, Siren, TrafficCone,
  Trash2, TreeDeciduous, Waves,
} from "lucide-react";
import { Pill } from "../components/ui";
import { catLabel } from "../lib/const";
import type { CaseDetail, Station } from "../lib/api";
import { PRIORITY_WORD, cleanTitle, longDur, overdueBy, plural, relTime } from "./format";

const CAT_ICON: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  pothole: Construction, streetlight_out: Lightbulb, sidewalk_damage: Footprints, manhole_cover: CircleDot,
  road_debris: TrafficCone, graffiti: Paintbrush, illegal_dumping: Trash2, downed_tree: TreeDeciduous,
  flooding: Waves, traffic_signal: Siren,
};

function whenOf(s: Station, now: number): string {
  const t = relTime(s.ts, now);
  if (t) return t;
  if (s.state !== "todo") return "";
  return s.key === "told" ? "after you approve" : "not yet";
}

export function CaseHero({ d, now }: { d: CaseDetail; now: number }) {
  const t = d.ticket;
  const Icon = CAT_ICON[d.category] ?? MapPin;
  const place = [d.address, t.neighborhood, t.district].filter(Boolean).join(" · ");
  const late = overdueBy(t, now);
  const ref = t.devrev_id ?? t.id;
  const neighbors = Math.max(1, t.reporters);
  return (
    <section className="wf-card wf-hero" aria-label="Selected case">
      <div className="wf-hero-top">
        <span className={`wf-cat tone-${t.priority_bucket}`} title={catLabel(d.category)}><Icon aria-hidden /></span>
        <div className="wf-hero-id">
          <h2 className="wf-hero-title">{cleanTitle(t.title)}</h2>
          <p className="wf-hero-place">{place || "Location pending"}</p>
        </div>
        <div className="wf-hero-pills">
          <Pill variant={t.priority_bucket}>{t.priority_bucket} · {PRIORITY_WORD[t.priority_bucket] ?? ""}</Pill>
          {t.overdue && <Pill variant="hazard">{late != null && late > 0 ? `${longDur(late)} overdue` : "Overdue"}</Pill>}
          {t.escalated && <Pill variant="P2">Escalated</Pill>}
        </div>
      </div>

      <div className="wf-promise">
        <span className="wf-promise-n">{neighbors.toLocaleString()}</span>
        <span className="wf-promise-t">{neighbors === 1 ? "neighbor" : "neighbors"} reported this<b>one ticket, one crew</b></span>
        <ArrowRight className="wf-promise-arrow" aria-hidden />
        <span className="t-mono wf-promise-id">{ref}</span>
        {d.duplicates_avoided > 0 && (
          <span className="wf-promise-save">Saved the city an estimated {plural(d.duplicates_avoided, "duplicate work order")}</span>
        )}
      </div>

      <ol className="wf-stations" aria-label="Journey from report to fix">
        {d.stations.map((s, i) => {
          const next = d.stations[i + 1];
          return (
            <li key={s.key} className={`wf-station is-${s.state} ${next ? `to-${next.state}` : ""}`} aria-current={s.state === "now" ? "step" : undefined}>
              <span className="wf-dot">{s.state === "done" ? <Check aria-hidden /> : i + 1}</span>
              <div className="wf-station-body">
                <b><span className="wf-sr">{s.state === "done" ? "Completed: " : s.state === "now" ? "Current step: " : "Not yet: "}</span>{s.title}</b>
                <span className="wf-station-detail">{s.detail}</span>
                <span className={`wf-chip ${s.chip_source === "devrev" ? "is-dev" : "is-cf"}`}>{s.chip}</span>
                <span className="wf-station-when">{whenOf(s, now)}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
