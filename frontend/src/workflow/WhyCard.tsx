import type { CaseDetail } from "../lib/api";

export function WhyCard({ d }: { d: CaseDetail }) {
  const b = d.ticket.priority_bucket;
  return (
    <section className="wf-card wf-why" aria-label="Why this priority">
      <div className="wf-why-top">
        <h3 className="wf-card-h is-sm">Why {b}</h3>
        <span className="grow" />
        <span className={`wf-why-score tone-${b}`}>{Math.round(d.priority_score)}</span>
        <span className="wf-why-of">/ 100</span>
      </div>
      {d.rationale && <p className="wf-card-p">{d.rationale}</p>}
      <div className="wf-factors">
        {d.factors.map((f) => {
          const pct = Math.max(0, Math.min(100, Math.round(f.pct)));
          return (
            <div key={f.label} className="wf-factor">
              <span className="wf-factor-row"><span>{f.label}</span><span className="wf-factor-v">{f.value}</span></span>
              <span className="wf-bar" role="img" aria-label={`${f.label}: ${f.value}`}>
                <span style={{ width: `${pct}%` }} />
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
