import type { ReactNode } from "react";
import { Search, TriangleAlert, Send } from "lucide-react";
import { Button, EmptyState, Skeleton } from "../components/ui";
import type { CaseCounts, CaseReason, CaseRow } from "../lib/api";
import { cleanTitle, railMeta } from "./format";

export const GROUPS: { reason: CaseReason; label: string }[] = [
  { reason: "new", label: "New, just in" },
  { reason: "approval", label: "Awaiting your approval" },
  { reason: "overdue", label: "Overdue" },
  { reason: "escalated", label: "Escalated" },
  { reason: "no_crew", label: "No crew yet" },
];

/** Each case lands in the first group (in display order) that applies to it. */
export function groupCases(items: CaseRow[]) {
  return GROUPS.map((g) => ({
    ...g,
    items: items.filter((i) => GROUPS.find((x) => i.reasons.includes(x.reason))?.reason === g.reason),
  })).filter((g) => g.items.length > 0);
}

/** `q` is the search the loaded rows answer, which can lag behind what is typed. */
export interface RailList { mode: "needs" | "all"; q: string; items: CaseRow[]; total: number; counts: CaseCounts; semantic: boolean }

function Item({ c, selected, now, onSelect }: { c: CaseRow; selected: boolean; now: number; onSelect: () => void }) {
  return (
    <button type="button" className={`wf-item ${selected ? "is-selected" : ""}`} aria-current={selected ? "true" : undefined} onClick={onSelect}>
      <span className="wf-item-title">{cleanTitle(c.title)}</span>
      <span className="wf-item-meta">
        <span className="t-mono wf-item-id">{c.devrev_id ?? c.id}</span> · {railMeta(c, now)}
      </span>
    </button>
  );
}

export function Rail({ list, loading, error, onRetry, q, onQ, browse, onBrowse, selectedIds, onSelect, onMore, moreLoading, now, sending, onSample }: {
  list: RailList | null; loading: boolean; error: string | null; onRetry: () => void;
  q: string; onQ: (v: string) => void; browse: boolean; onBrowse: () => void;
  selectedIds: (string | null | undefined)[]; onSelect: (c: CaseRow) => void;
  onMore: () => void; moreLoading: boolean; now: number; sending: boolean; onSample: () => void;
}) {
  const typing = q.trim() !== "";
  const searching = !!list && list.q !== "";  // what the rows on screen answer, not what is typed right now
  const isSel = (c: CaseRow) => selectedIds.includes(c.id) || (c.devrev_id != null && selectedIds.includes(c.devrev_id));
  const counts = list?.counts;
  const hasMore = !!list && list.items.length < list.total;

  let head: ReactNode;
  if (list?.mode === "all") {
    head = (
      <>
        <h2 className="wf-rail-title">{searching ? (list.semantic ? "Closest matches" : "Results") : "All cases"}</h2>
        <span className="wf-rail-num">{list.total.toLocaleString()}</span>
        {searching && list.semantic && <span className="wf-chip is-dev" title="Matched by meaning as well as by words">Smart search</span>}
        <span className="grow" />
        {counts && <span className="wf-rail-of">{counts.open.toLocaleString()} open overall</span>}
      </>
    );
  } else {
    head = (
      <>
        <h2 className="wf-rail-title">Needs you</h2>
        <span className="wf-rail-num">{counts ? counts.needs_you.toLocaleString() : "-"}</span>
        <span className="grow" />
        {counts && <span className="wf-rail-of">of {counts.open.toLocaleString()} open</span>}
      </>
    );
  }

  let body: ReactNode;
  if (error && !list) {
    body = (
      <div className="wf-inline-err" role="alert">
        <TriangleAlert aria-hidden /><span>Could not load cases. {error}</span>
        <Button size="sm" variant="secondary" onClick={onRetry}>Retry</Button>
      </div>
    );
  } else if (!list) {
    body = <div aria-busy="true"><Skeleton height={20} width="60%" /><div style={{ height: 8 }} /><Skeleton n={4} h={56} /></div>;
  } else if (list.items.length === 0) {
    body = searching ? (
      <p className="wf-rail-empty">No case matches "{list.q}".</p>
    ) : list.mode === "needs" ? (
      counts && counts.open === 0 ? (
        <EmptyState compact icon={<Send />} title="No tickets yet" description="Send a sample report and it shows up here as a real DevRev ticket."
          action={<Button size="sm" icon={<Send />} loading={sending} onClick={onSample}>Send a sample report</Button>} />
      ) : (
        <p className="wf-rail-empty">Nothing needs you right now. Everything open is on track.</p>
      )
    ) : (
      <p className="wf-rail-empty">No cases to show.</p>
    );
  } else if (list.mode === "needs") {
    body = groupCases(list.items).map((g, gi, arr) => (
      <section key={g.reason} className={`wf-group g-${g.reason}`} aria-label={g.label}>
        <h3 className="wf-group-head">
          <i aria-hidden />{g.label}
          <span className="wf-group-n">{g.items.length.toLocaleString()}{hasMore && gi === arr.length - 1 ? "+" : ""}</span>
        </h3>
        {g.items.map((c) => <Item key={c.id} c={c} now={now} selected={isSel(c)} onSelect={() => onSelect(c)} />)}
      </section>
    ));
  } else {
    body = <div className="wf-group">{list.items.map((c) => <Item key={c.id} c={c} now={now} selected={isSel(c)} onSelect={() => onSelect(c)} />)}</div>;
  }

  return (
    <aside className="wf-rail" aria-label={list?.mode === "all" ? (searching ? "Search results" : "All cases") : "Cases that need you"}>
      <div className="wf-rail-head">{head}</div>
      <label className="wf-search">
        <Search aria-hidden />
        <input type="search" aria-label="Find a case" placeholder="Find any case: street, ticket, crew" value={q}
          onChange={(e) => onQ(e.target.value)} />
      </label>
      {error && list && <div className="wf-inline-err" role="alert"><TriangleAlert aria-hidden /><span>Sync problem: {error}</span><Button size="sm" variant="secondary" onClick={onRetry}>Retry</Button></div>}
      <div className={`wf-rail-list ${loading ? "is-loading" : ""}`} aria-busy={loading || undefined}>
        {body}
        {hasMore && (
          <Button variant="ghost" size="sm" loading={moreLoading} onClick={onMore} block>
            Show more ({(list!.total - list!.items.length).toLocaleString()} left)
          </Button>
        )}
      </div>
      {!typing && (
        <Button variant="secondary" onClick={onBrowse} block>
          {browse ? "Back to what needs you" : "Browse all cases"}
        </Button>
      )}
      <p className="wf-rail-note">Everything on track stays out of your way. Search or browse when you need it.</p>
    </aside>
  );
}
