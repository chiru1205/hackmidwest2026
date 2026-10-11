import { Cpu } from "lucide-react";
import type { PlatformInfo, PlatformPart } from "@contracts";
import { Page } from "../components/shell/Page";
import { EmptyState, ErrorState, Skeleton } from "../components/ui";
import { platformInfo } from "../lib/api";
import { useNow } from "../workflow/useLive";
import { fmt, fmtMs } from "./format";
import { SyncPill } from "./SyncPill";
import { useFeed } from "./useFeed";
import "./impact.css";

const POLL_MS = 5000;

/** Judges' page: which service did what in this system, with live counts and latencies. Not in the navigation. */
export default function UnderTheHood() {
  const { data, error, lastOk, retry } = useFeed(() => platformInfo(), POLL_MS);
  const now = useNow(1000);
  const ago = lastOk != null ? Math.max(0, Math.floor((now - lastOk) / 1000)) : null;
  const stale = error != null && data != null;

  return (
    <Page width="wide" className="im-page">
      <div className="im">
        <header className="im-head">
          <div className="im-head-l">
            <h1 className="im-h1">Under the hood</h1>
            <p className="im-sub">What runs where in Civic Flow, with live counts and latencies measured from this running system.</p>
          </div>
          <SyncPill hasData={data != null} error={error} ago={ago} pollMs={POLL_MS} />
        </header>

        {stale && (
          <div className="im-inline-err" role="alert">
            <span>Could not refresh. Showing the last numbers. {error}</span>
            <button type="button" className="im-link" onClick={retry}>Retry</button>
          </div>
        )}

        {!data && !error && (
          <div className="im-loading" aria-busy="true" aria-label="Loading platform details">
            <Skeleton height={120} radius={24} />
            <div className="im-parts">{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={190} radius={24} />)}</div>
          </div>
        )}
        {!data && error && <section className="im-card"><ErrorState title="Could not load platform details" message={error} onRetry={retry} /></section>}
        {data && <Body d={data} />}
      </div>
    </Page>
  );
}

function Body({ d }: { d: PlatformInfo }) {
  return (
    <>
      <section className="im-card im-hood-top" aria-label="Summary">
        <div className="im-hood-stat">
          <span className="im-hood-num">{fmt(d.semantic_merges)}</span>
          <span className="im-hood-numl">semantic {d.semantic_merges === 1 ? "merge" : "merges"}</span>
        </div>
        <p className="im-hood-expl">
          Reports about the same problem that are worded differently or sit a few streets apart, so a distance check alone would have opened separate
          tickets. Embeddings matched them by meaning, and each became one ticket.
        </p>
        <ul className="im-hood-meta" aria-label="Runtime modes">
          <li><span>Hosting</span><b>{d.hosting}</b></li>
          <li><span>Agents</span><b>{d.agents_mode}</b></li>
          <li><span>Ticketing</span><b>{d.devrev_mode}</b></li>
        </ul>
      </section>

      {d.parts.length === 0 ? (
        <section className="im-card"><EmptyState icon={<Cpu />} title="No services reported yet" description="Counts appear here as soon as the first report is processed." /></section>
      ) : (
        <ul className="im-parts" aria-label="Services">
          {d.parts.map((p) => <Part key={`${p.provider}|${p.name}`} p={p} />)}
        </ul>
      )}
    </>
  );
}

const providerTone = (provider: string) => (/akamai|linode/i.test(provider) ? "is-ak" : /aws|amazon|bedrock/i.test(provider) ? "is-aws" : "is-other");

/** The API sends -1 for a part nothing counts calls for, so it reads "not tracked" rather than a false zero. */
function latency(p: PlatformPart): string {
  if (p.avg_ms < 0 || p.calls <= 0) return p.calls < 0 ? "not tracked" : "n/a";
  return p.avg_ms === 0 ? "under 1 ms" : fmtMs(p.avg_ms);
}

function Part({ p }: { p: PlatformPart }) {
  const tracked = p.calls >= 0;
  return (
    <li className="im-part">
      <div className="im-part-top">
        <span className={`im-chip ${providerTone(p.provider)}`}>{p.provider}</span>
        <h2 className="im-part-name">{p.name}</h2>
      </div>
      <p className="im-part-role">{p.role}</p>
      <dl className="im-part-nums">
        <div><dt>Calls</dt><dd>{tracked ? fmt(p.calls) : "not tracked"}</dd></div>
        <div><dt>Errors</dt><dd className={p.errors > 0 ? "is-bad" : ""}>{tracked ? fmt(p.errors) : "not tracked"}</dd></div>
        <div><dt>Avg latency</dt><dd>{latency(p)}</dd></div>
      </dl>
      {p.detail && <p className="im-part-detail">{p.detail}</p>}
    </li>
  );
}
