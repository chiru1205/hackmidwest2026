import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Inbox, Send, TriangleAlert } from "lucide-react";
import type { Category } from "@contracts";
import { Page } from "../components/shell/Page";
import { Button, EmptyState, Skeleton, useMediaQuery, useReducedMotion, useToast } from "../components/ui";
import { api, devrevCase, devrevCases, type CaseDetail, type CaseRow } from "../lib/api";
import { Decision, NextStep } from "./Decision";
import { DevRevCard } from "./DevRevCard";
import { CaseHero } from "./Journey";
import { Rail, groupCases, type RailList } from "./Rail";
import { WhyCard } from "./WhyCard";
import { useDebounced, useNow, usePoll } from "./useLive";
import "./workflow.css";

const PAGE = 30;
const POLL_MS = 5000;
const PLAZA = { lat: 39.042, lng: -94.595 };
const KC = { lat: 39.0997, lng: -94.5786 };
const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export default function WorkflowPage() {
  const toast = useToast();
  const reduced = useReducedMotion();
  const narrow = useMediaQuery("(max-width: 979px)");
  const now = useNow(1000);
  const [sp, setSp] = useSearchParams();
  const sel = sp.get("case");
  const mainRef = useRef<HTMLDivElement>(null);

  /* ---- rail: search, browse, paging ---- */
  const [qRaw, setQRaw] = useState("");
  const q = useDebounced(qRaw.trim(), 250);
  const [browse, setBrowse] = useState(false);
  const mode: "needs" | "all" = browse || q ? "all" : "needs";
  const key = `${mode}|${q}`;
  const [paged, setPaged] = useState({ key: "", pages: 1 });
  const pages = paged.key === key ? paged.pages : 1;

  const [list, setList] = useState<RailList | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);
  const [listBusy, setListBusy] = useState(false);
  const [lastOk, setLastOk] = useState<number | null>(null);
  const [source, setSource] = useState<"devrev" | "local board" | null>(null);
  const listRef = useRef<RailList | null>(null);
  listRef.current = list;
  const listReq = useRef(0);
  const listCtl = useRef<AbortController | null>(null);
  const params = useRef({ mode, q, pages });
  params.current = { mode, q, pages };

  /** Loads every page fetched so far so the rail stays whole. A background poll skips while a request is still
   *  running and refreshes only the first page (the loaded rest is kept); anything else replaces what is in flight.
   *  Resolves to the items, or null on error / when skipped. */
  const loadList = useCallback(async (poll = false): Promise<CaseRow[] | null> => {
    if (poll && listCtl.current) return null;
    listCtl.current?.abort();
    const ctl = new AbortController();
    listCtl.current = ctl;
    const { mode: m, q: query, pages: n } = params.current;
    const id = ++listReq.current;
    setListBusy(true);
    try {
      const fetchPage = (i: number) => devrevCases({ group: m, q: query || undefined, limit: PAGE, offset: i * PAGE }, ctl.signal);
      const rs = await Promise.all(Array.from({ length: poll ? 1 : n }, (_, i) => fetchPage(i)));
      if (id !== listReq.current) return null;
      let items = rs.flatMap((r) => r.items);
      const prev = listRef.current;
      if (poll && prev && prev.mode === m && prev.q === query) items = [...items, ...prev.items.slice(PAGE)];
      const seen = new Set<string>();
      items = items.filter((c) => !seen.has(c.id) && !!seen.add(c.id));
      setList({ mode: m, q: query, items, total: rs[0].total, counts: rs[0].counts });
      setSource(rs[0].source);
      setListErr(null); setLastOk(Date.now());
      return items;
    } catch (e) {
      if (!ctl.signal.aborted && id === listReq.current) setListErr(errMsg(e, "Could not load cases"));
      return null;
    } finally {
      if (listCtl.current === ctl) listCtl.current = null;
      if (id === listReq.current) setListBusy(false);
    }
  }, []);
  useEffect(() => { loadList(); }, [key, pages, loadList]);
  usePoll(() => loadList(true), POLL_MS);

  /* ---- selected case ---- */
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const selRef = useRef(sel);
  selRef.current = sel;
  const detailReq = useRef(0);
  const detailCtl = useRef<AbortController | null>(null);
  /** Same rules as the list: a poll skips while a request runs; anything else supersedes it, so an old
   *  response can never overwrite the state right after an action. */
  const loadDetail = useCallback(async (poll = false) => {
    const id = selRef.current;
    if (!id || (poll && detailCtl.current)) return;
    detailCtl.current?.abort();
    const ctl = new AbortController();
    detailCtl.current = ctl;
    const seq = ++detailReq.current;
    try {
      const d = await devrevCase(id, ctl.signal);
      if (selRef.current !== id || seq !== detailReq.current) return;
      setDetail(d); setDetailErr(null);
    } catch (e) {
      if (!ctl.signal.aborted && selRef.current === id && seq === detailReq.current) setDetailErr(errMsg(e, "Could not load this case"));
    } finally {
      if (detailCtl.current === ctl) detailCtl.current = null;
    }
  }, []);
  useEffect(() => { setDetail(null); setDetailErr(null); loadDetail(); }, [sel, loadDetail]);
  usePoll(() => loadDetail(true), POLL_MS);

  const select = useCallback((c: CaseRow, fromClick = false) => {
    setSp((p) => { const n = new URLSearchParams(p); n.set("case", c.id); return n; }, { replace: true });
    if (fromClick) {  // keyboard users land on the case, not back in the rail
      mainRef.current?.focus({ preventScroll: true });
      if (narrow) requestAnimationFrame(() => mainRef.current?.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" }));
    }
  }, [setSp, narrow, reduced]);

  // first load: open the first case that needs the user, else the first case
  const autoDone = useRef(false);
  useEffect(() => {
    if (!list || autoDone.current) return;
    if (sel) { autoDone.current = true; return; }
    const first = groupCases(list.items)[0]?.items[0] ?? list.items[0];
    if (first) { autoDone.current = true; select(first); }
  }, [list, sel, select]);

  const refreshAll = useCallback(() => { loadList(); loadDetail(); }, [loadList, loadDetail]);

  /* ---- sample report (kept from the old page) ---- */
  const [sending, setSending] = useState(false);
  const sendSample = async () => {
    setSending(true);
    try {
      const plaza = Math.random() < 0.5;
      const lat = plaza ? PLAZA.lat + (Math.random() - 0.5) * 0.0004 : KC.lat + (Math.random() - 0.5) * 0.14;
      const lng = plaza ? PLAZA.lng + (Math.random() - 0.5) * 0.0004 : KC.lng + (Math.random() - 0.5) * 0.12;
      const r = await api.submitReport({ lat, lng, accuracy_m: 12, category: "pothole" as Category, note: "Case-flow demo: sample report", severity: 3 });
      if (r.outcome === "rejected") { toast(r.reject_reason || r.message || "Report rejected"); return; }
      toast(r.outcome === "merged" ? "Merged into an existing ticket" : "Report sent. A new ticket is on its way");
      // the DevRev ticket can take a moment to be mirrored; look for it by cluster (it may not be in "needs you")
      const cid = r.cluster?.id;
      for (let i = 0; cid && i < 4; i++) {
        await new Promise((res) => setTimeout(res, 1500));
        try {
          const found = await devrevCases({ group: "all", q: cid, limit: 100 });
          const hit = found.items.find((c) => c.cluster_id === cid);
          if (hit) { select(hit); loadList(); break; }
        } catch { /* try again */ }
      }
    } catch (e) {
      toast(errMsg(e, "Could not send the report"));
    } finally { setSending(false); }
  };

  /* ---- header sync pill ---- */
  const ago = lastOk != null ? Math.max(0, Math.floor((now - lastOk) / 1000)) : null;
  const paused = listErr != null && (ago == null || ago > 12);
  const sync = useMemo(() => {
    if (paused) return { tone: "warn", text: "Sync paused, retrying" };
    if (ago == null) return { tone: "idle", text: "Connecting to DevRev" };
    if (source === "local board") return { tone: "idle", text: "Local board, not connected to DevRev" };
    return { tone: "ok", text: `Two-way sync with DevRev · updated ${ago < 1 ? "just now" : `${ago} s ago`}` };
  }, [paused, ago, source]);

  const selectedIds = [sel, detail?.ticket.id, detail?.ticket.devrev_id];
  const listEmpty = !!list && list.items.length === 0 && list.counts.open === 0 && q === "";

  let main;
  if (sel && detail) {
    main = (
      <>
        {detailErr && (
          <div className="wf-inline-err" role="alert">
            <TriangleAlert aria-hidden /><span>Could not refresh this case. Showing the last data. {detailErr}</span>
            <Button size="sm" variant="secondary" onClick={() => loadDetail()}>Retry</Button>
          </div>
        )}
        <CaseHero d={detail} now={now} />
        {detail.ticket.stage_key === "awaiting_verification"
          ? <Decision key={detail.ticket.id} d={detail} onChanged={refreshAll} />
          : <NextStep key={detail.ticket.id} d={detail} onChanged={refreshAll} />}
        <div className="wf-pair">
          <DevRevCard d={detail} now={now} />
          <WhyCard d={detail} />
        </div>
      </>
    );
  } else if (sel && detailErr) {
    main = (
      <div className="wf-card wf-state">
        <div className="wf-inline-err" role="alert">
          <TriangleAlert aria-hidden /><span>Could not load this case. {detailErr}</span>
          <Button size="sm" variant="secondary" onClick={() => loadDetail()}>Retry</Button>
        </div>
      </div>
    );
  } else if (sel || !list) {
    main = (
      <div className="wf-card wf-state" aria-busy="true" aria-label="Loading case">
        <Skeleton height={56} width="60%" /><Skeleton height={64} radius={16} /><Skeleton height={150} radius={16} />
      </div>
    );
  } else if (listEmpty) {
    main = (
      <div className="wf-card wf-state">
        <EmptyState icon={<Inbox />} title="No tickets yet"
          description="Send a sample report and it shows up here as a real DevRev ticket, with its whole journey."
          action={<Button icon={<Send />} loading={sending} onClick={sendSample}>Send a sample report</Button>} />
      </div>
    );
  } else {
    main = (
      <div className="wf-card wf-state">
        <EmptyState icon={<Inbox />} title="Pick a case" description="Choose a case on the left to see its journey from photo to fixed street." />
      </div>
    );
  }

  return (
    <Page width="wide" className="wf-page">
      <div className="wf">
        <header className="wf-head">
          <div className="wf-head-l">
            <h1 className="wf-h1">Case journey</h1>
            <p className="wf-sub">From a citizen&rsquo;s photo to a fixed street. Every step marked <b>DevRev</b> is a real record in DevRev.</p>
          </div>
          <div className="wf-head-r">
            <span className={`wf-sync is-${sync.tone}`}><i aria-hidden />{sync.text}</span>
            <Button variant="secondary" size="sm" icon={<Send />} loading={sending} onClick={sendSample}>Send a sample report</Button>
          </div>
        </header>

        <div className="wf-body">
          <Rail
            list={list} loading={!!list && listErr == null && (list.mode !== mode || list.q !== qRaw.trim())} error={listErr} onRetry={() => { loadList(); }}
            q={qRaw} onQ={setQRaw} browse={browse} onBrowse={() => setBrowse((b) => !b)}
            selectedIds={selectedIds} onSelect={(c) => select(c, true)}
            onMore={() => setPaged({ key, pages: pages + 1 })} moreLoading={listBusy}
            now={now} sending={sending} onSample={sendSample}
          />
          <div className="wf-main" ref={mainRef} tabIndex={-1}>{main}</div>
        </div>
      </div>
    </Page>
  );
}
