import { useState, type ReactNode } from "react";
import { TrendingUp } from "lucide-react";
import type { ImpactFact, ImpactLive } from "@contracts";
import { Page } from "../components/shell/Page";
import { EmptyState, ErrorState, Skeleton } from "../components/ui";
import { impactLive } from "../lib/api";
import { useNow } from "../workflow/useLive";
import { fmt, fmtDuration, findFact, nums, pct } from "./format";
import { SyncPill } from "./SyncPill";
import { useFeed } from "./useFeed";
import "./impact.css";

const POLL_MS = 10000;
const DEFAULT_MIN = 30;
const DEFAULT_RATE = 45;

type Tag = "real" | "live" | "est";
const TAG_TEXT: Record<Tag, string> = { real: "REAL", live: "LIVE DEMO", est: "ESTIMATE" };
const TagPill = ({ kind }: { kind: Tag }) => <span className={`im-tag is-${kind}`}>{TAG_TEXT[kind]}</span>;

export default function ImpactPage() {
  const { data, error, lastOk, retry } = useFeed(() => impactLive(), POLL_MS);
  const now = useNow(1000);
  const ago = lastOk != null ? Math.max(0, Math.floor((now - lastOk) / 1000)) : null;
  const stale = error != null && data != null;

  return (
    <Page width="wide" className="im-page">
      <div className="im">
        <header className="im-head">
          <div className="im-head-l">
            <h1 className="im-h1">Impact</h1>
            <p className="im-sub">
              What &ldquo;many reports, one ticket&rdquo; is worth to Kansas City. Three kinds of numbers, always labeled:{" "}
              <b>Real</b> (KC open data), <b>Live demo</b> (this system right now, which includes the storm demo) and{" "}
              <b>Estimate</b> (you can change the assumptions).
            </p>
          </div>
          <SyncPill hasData={data != null} error={error} ago={ago} pollMs={POLL_MS} />
        </header>

        {stale && (
          <div className="im-inline-err" role="alert">
            <span>Could not refresh. Showing the last numbers. {error}</span>
            <button type="button" className="im-link" onClick={retry}>Retry</button>
          </div>
        )}

        {!data && !error && <Loading />}
        {!data && error && (
          <section className="im-card"><ErrorState title="Could not load the impact numbers" message={error} onRetry={retry} /></section>
        )}
        {data && data.reports === 0 && data.facts.length === 0 && (
          <section className="im-card">
            <EmptyState icon={<TrendingUp />} title="No reports yet" description="Once residents start reporting, the savings from merging duplicates show up here." />
          </section>
        )}
        {data && !(data.reports === 0 && data.facts.length === 0) && <Body d={data} />}
      </div>
    </Page>
  );
}

function Loading() {
  return (
    <div className="im-loading" aria-busy="true" aria-label="Loading impact numbers">
      <Skeleton height={260} radius={28} />
      <div className="im-row"><Skeleton height={230} radius={24} /><Skeleton height={230} radius={24} /></div>
      <div className="im-row"><Skeleton height={260} radius={24} /><Skeleton height={260} radius={24} /></div>
    </div>
  );
}

function Body({ d }: { d: ImpactLive }) {
  const [mins, setMins] = useState(DEFAULT_MIN);
  const [rate, setRate] = useState(DEFAULT_RATE);
  // round the hours exactly as they are printed (whole above 100, else one decimal), then price those hours,
  // so "hours x rate = dollars" is true on the page
  const rawHours = (d.duplicates_avoided * mins) / 60;
  const hours = rawHours >= 100 ? Math.round(rawHours) : Math.round(rawHours * 10) / 10;
  const dollars = Math.round(hours * rate);
  const fmtHours = (h: number) => (h >= 100 ? fmt(h) : h.toLocaleString("en-US", { maximumFractionDigits: 1 }));

  // the footer cites only what a card on this page actually shows
  const problem = problemFacts(d.facts);
  const close = closeFacts(d.facts);
  const shown = [...(problem ? [problem.total, problem.repeatF, problem.cancelF, problem.yearly] : []), ...(close ? [close.f] : [])];
  const sources = Array.from(new Set(shown.map((f) => f?.source).filter(Boolean)));
  const hasEstimate = shown.some((f) => f?.estimate);

  return (
    <>
      <Hero d={d} hours={fmtHours(hours)} dollars={`$${fmt(dollars)}`} />
      <div className="im-row">
        <ProblemCard facts={d.facts} />
        <CloseCard facts={d.facts} />
      </div>
      <div className="im-row">
        <Districts d={d} />
        <MathCard avoided={d.duplicates_avoided} mins={mins} rate={rate} hours={fmtHours(hours)} dollars={`$${fmt(dollars)}`} onMins={setMins} onRate={setRate} />
      </div>
      <Split d={d} />
      <p className="im-src">
        {sources.length > 0 && <>Sources: {sources.join(". ")}. </>}
        {hasEstimate && <>Marked estimates are our own analysis of that data. </>}
        Live figures are counted by this system and include the storm demo, not only reports from residents.
        Staff time and cost are estimates from the two assumptions above, not measured savings.
      </p>
    </>
  );
}

/* ---------- hero ---------- */
function Hero({ d, hours, dollars }: { d: ImpactLive; hours: string; dollars: string }) {
  const max = Math.max(d.reports, 1);
  const rows = [
    { label: "Reports received", n: d.reports, c: "var(--im-hero-a)" },
    { label: "Unique issues", n: d.unique_issues, c: "var(--im-hero-b)" },
    { label: "Tickets opened", n: d.tickets_in_devrev, c: "var(--im-hero-c)" },
  ];
  return (
    <section className="im-hero" aria-label="Headline">
      <div className="im-hero-l">
        <span className="im-hero-tag">LIVE DEMO</span>
        <div className="im-hero-big">
          {fmt(d.reports)} {d.reports === 1 ? "report" : "reports"}.<br />
          <span>{fmt(d.tickets_in_devrev)} {d.tickets_in_devrev === 1 ? "ticket" : "tickets"}.</span>
        </div>
        <p className="im-hero-p">Every duplicate that would have become its own work order is merged into the issue it belongs to, then sent to one crew.</p>
        {d.median_report_to_ticket_s != null && (
          <p className="im-hero-stat">
            Median time from report to ticket <b>{fmtDuration(d.median_report_to_ticket_s)}</b>
          </p>
        )}
      </div>
      <div className="im-hero-r">
        <ul className="im-funnel" aria-label="From reports to tickets">
          {rows.map((r) => (
            <li key={r.label}>
              <span className="im-funnel-l">{r.label}</span>
              <span className="im-funnel-track" aria-hidden>
                <span className="im-funnel-bar" style={{ width: `${Math.max(2, (r.n / max) * 100)}%`, background: r.c }} />
              </span>
              <span className="im-funnel-n">{fmt(r.n)}</span>
            </li>
          ))}
        </ul>
        <div className="im-tiles">
          <div className="im-tile"><b>{fmt(d.duplicates_avoided)}</b><span>work orders avoided</span></div>
          <div className="im-tile"><b>{hours}</b><span>staff hours saved <em>EST.</em></span></div>
          <div className="im-tile"><b>{dollars}</b><span>cost avoided <em>EST.</em></span></div>
        </div>
      </div>
    </section>
  );
}

/* ---------- real data: the 311 problem ---------- */
const REPEAT = /within|repeat|earlier/i;

/** The facts the 311 card draws, or null when it has nothing sourced to draw. */
function problemFacts(facts: ImpactFact[]) {
  const total = facts.find((f) => /311 requests/i.test(f.label) && !/pothole/i.test(f.label));
  const yearly = facts.find((f) => /pothole/i.test(f.label) && /requests/i.test(f.label) && !/cancel/i.test(f.label) && !REPEAT.test(f.label));
  const repeatF = facts.find((f) => REPEAT.test(f.label));
  const cancelF = facts.find((f) => /cancel/i.test(f.label));
  const repeat = pct(repeatF);
  const canceled = pct(cancelF);
  if (repeat == null && canceled == null) return null;
  return { total, yearly, repeatF, cancelF, repeat, canceled };
}

function ProblemCard({ facts }: { facts: ImpactFact[] }) {
  const p = problemFacts(facts);
  if (!p) return null;  // nothing sourced to draw
  const { total, yearly, repeatF, cancelF, repeat, canceled } = p;
  const sources = Array.from(new Set([total?.source, repeatF?.source, cancelF?.source, yearly?.source].filter(Boolean)));
  // two shares of the same requests, drawn as two separate bars: the canceled ones are often the repeats, so they are not parts of one whole
  const rows = [
    repeat != null && { k: "rep", n: Math.round(repeat), label: <><b>~{Math.round(repeat)}</b> repeat an earlier one within 50 m and 30 days {repeatF?.estimate && <em className="im-est">EST.</em>}</> },
    canceled != null && { k: "can", n: Math.round(canceled), label: <><b>{Math.round(canceled)}</b> are canceled{cancelF?.note ? `, ${cancelF.note.charAt(0).toLowerCase()}${cancelF.note.slice(1)}` : ""}</> },
  ].filter(Boolean) as { k: string; n: number; label: ReactNode }[];
  const alt = rows.map((r) => `${r.n} of 100`).join(" and ");

  return (
    <section className="im-card" aria-labelledby="im-h-311">
      <div className="im-card-h"><h2 id="im-h-311">The 311 problem in Kansas City</h2><TagPill kind="real" /></div>
      {total && (
        <div className="im-bigline">
          <span className="im-big">{total.value.replace(/^about\s+/i, "")}</span>
          <span className="im-bigl">{total.label}{/^about/i.test(total.value) ? " (approximate)" : ""}</span>
        </div>
      )}
      <p className="im-note">Of every 100 pothole requests{yearly ? ` (${yearly.value} a year)` : ""}, {alt}:</p>
      <ul className="im-bars is-stack" aria-label="Share of pothole requests that repeat or are canceled">
        {rows.map((r) => (
          <li key={r.k}>
            <span className="im-bars-l">{r.label}</span>
            <span className="im-bars-track" aria-hidden><span className={`is-${r.k}`} style={{ width: `${r.n}%` }} /></span>
            <span className="im-bars-n">{r.n}%</span>
          </li>
        ))}
      </ul>
      {rows.length > 1 && <p className="im-note">These overlap: many canceled requests are the same repeats, so the two shares are not added together.</p>}
      {total?.note && <p className="im-note">{total.note}.</p>}
      {sources.length > 0 && <p className="im-note">Source: {sources.join("; ")}</p>}
    </section>
  );
}

/* ---------- real data: days to close ---------- */
/** The median fact and its numbers, or null when there is no number to draw. */
function closeFacts(facts: ImpactFact[]) {
  const f = findFact(facts, /median/i);
  // "13 (90th percentile 51)": the "90th" is not a value, so read the number after the word percentile
  const median = f ? nums(f.value)[0] : undefined;
  const p90 = f ? Number(/percentile\D*(\d+(?:\.\d+)?)/i.exec(f.value)?.[1] ?? NaN) : NaN;
  if (!f || median == null || !Number.isFinite(median)) return null;
  return { f, median, p90 };
}

function CloseCard({ facts }: { facts: ImpactFact[] }) {
  const c = closeFacts(facts);
  if (!c) return null;  // nothing sourced to draw
  const { f, median, p90 } = c;
  const top = p90 > median ? Math.max(60, Math.ceil((p90 * 1.1) / 10) * 10) : Math.max(30, Math.ceil((median * 2.5) / 10) * 10);
  const at = (v: number) => Math.min(100, Math.max(0, (v / top) * 100));
  const hasP90 = p90 > median;
  return (
    <section className="im-card" aria-labelledby="im-h-close">
      <div className="im-card-h"><h2 id="im-h-close">How long a pothole takes to close</h2><TagPill kind="real" /></div>
      <div className="im-bigline">
        <span className="im-big">{median} days</span>
        <span className="im-bigl">median{hasP90 ? ` · 1 in 10 waits ${p90}+ days` : ""}</span>
      </div>
      <div className="im-strip" role="img" aria-label={`Half of potholes close within ${median} days${hasP90 ? `; one in ten takes ${p90} days or more` : ""}. Scale is 0 to ${top} days.`}>
        <div className="im-strip-track" />
        <div className="im-strip-fill is-a" style={{ width: `${at(median)}%` }} />
        {hasP90 && <div className="im-strip-fill is-b" style={{ left: `${at(median)}%`, width: `${at(p90) - at(median)}%` }} />}
        <div className="im-strip-pin is-a" style={{ left: `${at(median)}%` }} />
        {hasP90 && <div className="im-strip-pin is-b" style={{ left: `${at(p90)}%` }} />}
        <span className="im-strip-lab is-a" style={{ left: `${Math.max(at(median), 12)}%` }}>Median {median} d</span>
        {hasP90 && <span className="im-strip-lab is-b" style={{ left: `${Math.min(at(p90), 88)}%` }}>90th percentile {p90} d</span>}
        <span className="im-strip-end is-l">0 days</span>
        <span className="im-strip-end is-r">{top} days</span>
      </div>
      <p className="im-note">
        {f.note ? `${f.note}. ` : ""}Seeing exactly which cases are late, with the crew attached, is how a city moves the long tail.
      </p>
      {f.source && <p className="im-note">Source: {f.source}</p>}
    </section>
  );
}

/* ---------- live: districts ---------- */
function Districts({ d }: { d: ImpactLive }) {
  const rows = d.districts;
  const max = Math.max(1, ...rows.map((r) => r.duplicates));
  const total = rows.reduce((s, r) => s + r.duplicates, 0);
  return (
    <section className="im-card" aria-labelledby="im-h-dist">
      <div className="im-card-h"><h2 id="im-h-dist">Where reports collapse into tickets</h2><TagPill kind="live" /></div>
      <p className="im-note">Duplicate reports merged, by council district</p>
      {rows.length === 0 || total === 0 ? (
        <p className="im-empty">No duplicates merged yet. They appear here as residents report the same problem twice.</p>
      ) : (
        <ul className="im-bars">
          {rows.map((r) => (
            <li key={r.label}>
              <span className="im-bars-l">{r.label}</span>
              <span className="im-bars-track" aria-hidden><span style={{ width: `${(r.duplicates / max) * 100}%` }} /></span>
              <span className="im-bars-n">{fmt(r.duplicates)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------- estimate: check our math ---------- */
function MathCard(p: { avoided: number; mins: number; rate: number; hours: string; dollars: string; onMins: (n: number) => void; onRate: (n: number) => void }) {
  return (
    <section className="im-card" aria-labelledby="im-h-math">
      <div className="im-card-h"><h2 id="im-h-math">Check our math</h2><TagPill kind="est" /></div>
      <p className="im-note">The savings above are the avoided work orders times these two assumptions. Change them to your own numbers.</p>
      <div className="im-slider">
        <label htmlFor="im-mins"><span>Staff time to triage one duplicate</span><b>{p.mins} min</b></label>
        <input id="im-mins" type="range" min={5} max={90} step={5} value={p.mins} onChange={(e) => p.onMins(Number(e.target.value))} />
      </div>
      <div className="im-slider">
        <label htmlFor="im-rate"><span>Loaded staff cost per hour</span><b>${p.rate}</b></label>
        <input id="im-rate" type="range" min={20} max={120} step={5} value={p.rate} onChange={(e) => p.onRate(Number(e.target.value))} />
      </div>
      <p className="im-sum" aria-live="polite">
        {fmt(p.avoided)} duplicates &times; {p.mins} min = <b>{p.hours} hours</b> &times; ${p.rate} = <b className="is-ok">{p.dollars}</b>
        <span className="im-est-flag">ESTIMATE</span>
      </p>
    </section>
  );
}

/* ---------- live: agents and people ---------- */
function Split({ d }: { d: ImpactLive }) {
  const s = d.split;
  const segs = [
    { k: "agent", n: s.closed_by_agent, label: "closed by the agent" },
    { k: "crew", n: s.on_track, label: "on track with crews" },
    { k: "person", n: s.needs_person, label: "need a person" },
  ];
  const sum = segs.reduce((a, x) => a + x.n, 0);
  // the split covers the cases still open plus those the agent closed; closed-by-a-person cases and storm-demo issues kept off the board are not in it
  const scope = d.unique_issues > s.total ? `${fmt(s.total)} cases counted, out of ${fmt(d.unique_issues)} issues in all` : `${fmt(s.total)} cases counted`;
  return (
    <section className="im-card" aria-labelledby="im-h-split">
      <div className="im-card-h"><h2 id="im-h-split">Agents do the routine. People decide the exceptions.</h2><TagPill kind="live" /></div>
      {s.total === 0 || sum === 0 ? (
        <p className="im-empty">No open cases yet, so there is nothing to split.</p>
      ) : (
        <>
          <div className="im-split" role="img" aria-label={`Of ${scope}: ${segs.map((x) => `${fmt(x.n)} ${x.label}`).join(", ")}`}>
            {segs.map((x) => x.n > 0 && <span key={x.k} className={`im-split-seg is-${x.k}`} style={{ flexGrow: x.n }} />)}
          </div>
          <ul className="im-split-legend">
            {segs.map((x) => (
              <li key={x.k}><i className={`im-split-key is-${x.k}`} aria-hidden /><b>{fmt(x.n)}</b> <span>{x.label}</span></li>
            ))}
            <li className="im-split-total">{scope}</li>
          </ul>
        </>
      )}
    </section>
  );
}
