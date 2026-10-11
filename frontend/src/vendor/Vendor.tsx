import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Building2, MapPin, CheckCheck, CircleDot, Clock, Inbox, Layers, Link2, PlayCircle, Search, ShieldCheck, TriangleAlert, Users } from "lucide-react";
import type { VendorOrder } from "@contracts";
import { api } from "../lib/api";
import { useAsync, useEvents } from "../lib/hooks";
import {
  Avatar, EmptyState, ErrorState, Pill, PriorityBadge, SegmentedControl, Sheet, Skeleton, TicketId, devrevOf, useMediaQuery, useToast, list, item,
} from "../components/ui";
import Detail, { StagePill } from "./Detail";
import { GeoChips, districtOf, zonesOf } from "../ops/geo";
import { CategoryIcon, Photo } from "./parts";
import { applyOverride, dueFor, isOverdue, loadAwaiting, placeOf, rememberAwaiting, stageOf, titleOf, type Override } from "./util";
import { pinFresh } from "../lib/fresh";
import "./vendor.css";

const VENDORS = ["KC Road Crew Co.", "BrightLine Lighting", "GreenLeaf Urban Services"];
type Filter = "all" | "open" | "progress" | "awaiting" | "fixed" | "overdue";
type Sort = "priority" | "due";
const PAGE = 40;

export default function Vendor() {
  const orders = useAsync(() => api.vendorOrders(), []);
  const health = useAsync(() => api.health(), []);
  const toast = useToast();
  const wide = useMediaQuery("(min-width: 1100px)");
  const phone = useMediaQuery("(max-width: 640px)");

  const [vendor, setVendor] = useState("");
  const [district, setDistrict] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("priority");
  const [q, setQ] = useState("");
  const [selId, setSelId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [ov, setOv] = useState<Record<string, Override>>(loadAwaiting);
  const listRef = useRef<HTMLUListElement>(null);

  // live: any ticket/cluster change refreshes the list (debounced)
  const timer = useRef<number>();
  useEvents((e) => {
    if (e.type === "ticket.updated" || e.type === "cluster.updated" || e.type === "cluster.created" || e.type === "reset") {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(orders.reload, 1500);
    }
  });
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // The server now says which orders are awaiting verification, so what this browser remembered from an earlier visit
  // is dropped once the first list loads (the city may have approved or sent the repair back since).
  const reconciled = useRef(false);
  useEffect(() => {
    if (!orders.data || reconciled.current) return;
    reconciled.current = true;
    const byId = new Map(orders.data.map((o) => [o.cluster.id, o]));
    const stale = Object.keys(ov).filter((id) => ov[id].awaiting && !byId.get(id)?.ticket?.tags?.includes("awaiting_verification"));
    if (!stale.length) return;
    stale.forEach((id) => rememberAwaiting(id, false));
    setOv((m) => { const n = { ...m }; stale.forEach((id) => { if (n[id]?.awaiting) delete n[id]; }); return n; });
  }, [orders.data]);  // eslint-disable-line react-hooks/exhaustive-deps

  const all = useMemo(() => {
    const base = orders.data ?? [];
    const ids = new Set(base.map((o) => o.cluster.id));
    const extra = Object.values(ov).flatMap((v) => (v.snapshot && !ids.has(v.snapshot.cluster.id) ? [v.snapshot] : []));
    return [...base, ...extra].map((o) => applyOverride(o, ov[o.cluster.id]));
  }, [orders.data, ov]);

  const vendors = useMemo(() => {
    const extra = [...new Set(all.map((o) => o.cluster.vendor).filter((v): v is string => !!v && !VENDORS.includes(v)))].sort();
    return [...VENDORS, ...extra];
  }, [all]);
  const districts = useMemo(() => [...new Set(all.map((o) => districtOf(o.cluster)).filter((d): d is string => !!d))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [all]);
  const districtCounts = useMemo(() => {
    const m: Record<string, number> = {};
    all.forEach((o) => { const d = districtOf(o.cluster); if (d && stageOf(o) !== "resolved" && (!vendor || o.cluster.vendor === vendor)) m[d] = (m[d] ?? 0) + 1; });
    return m;
  }, [all, vendor]);
  const forVendor = useMemo(() => all.filter((o) => (!vendor || o.cluster.vendor === vendor) && (!district || districtOf(o.cluster) === district)), [all, vendor, district]);
  const now = Date.now();
  const counts = useMemo(() => {
    const n = { all: forVendor.length, open: 0, progress: 0, awaiting: 0, fixed: 0, overdue: 0 };
    forVendor.forEach((o) => {
      const s = stageOf(o);
      if (s === "queued") n.open++; else if (s === "in_progress") n.progress++; else if (s === "awaiting_verification") n.awaiting++; else n.fixed++;
      if (isOverdue(o, now)) n.overdue++;
    });
    return n;
  }, [forVendor, now]);
  const vendorCounts = useMemo(() => {
    const m: Record<string, number> = {};
    all.forEach((o) => { if (stageOf(o) !== "resolved") m[o.cluster.vendor ?? ""] = (m[o.cluster.vendor ?? ""] ?? 0) + 1; });
    return m;
  }, [all]);

  const visibleAll = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = forVendor.filter((o) => {
      const s = stageOf(o);
      if (filter === "open" && s !== "queued") return false;
      if (filter === "progress" && s !== "in_progress") return false;
      if (filter === "awaiting" && s !== "awaiting_verification") return false;
      if (filter === "fixed" && s !== "resolved") return false;
      if (filter === "overdue" && !isOverdue(o, now)) return false;
      if (needle) {
        const hay = `${titleOf(o.cluster)} ${o.ticket?.id ?? ""} ${o.cluster.neighborhood ?? ""} ${districtOf(o.cluster) ?? ""} ${zonesOf(o.cluster).join(" ")} ${o.cluster.vendor ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    rows.sort((a, b) => {
      const rank = (o: typeof a) => { const s = stageOf(o); return s === "resolved" ? 2 : s === "awaiting_verification" ? 1 : 0; };  // the crew's own work first
      const ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      return sort === "due" ? +new Date(a.due) - +new Date(b.due) : b.cluster.priority - a.cluster.priority;
    });
    return pinFresh(rows, (o) => o.cluster.last_reported_at, (o) => o.cluster.id, (o) => o.cluster.simulated || stageOf(o) === "resolved");
  }, [forVendor, filter, q, sort, now]);
  const visible = visibleAll.rows;
  const fresh = visibleAll.fresh;

  useEffect(() => { setLimit(PAGE); }, [vendor, district, filter, q, sort]);

  const effId = selId ?? (wide ? visible[0]?.cluster.id ?? null : null);
  const current = effId ? all.find((o) => o.cluster.id === effId) ?? null : null;

  const select = useCallback((id: string, openSheet = false) => {
    setSelId(id);
    if (openSheet) setOpen(true);
  }, []);

  function onKey(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const idx = visible.findIndex((o) => o.cluster.id === effId);
    const next = visible[Math.min(visible.length - 1, Math.max(0, idx + (e.key === "ArrowDown" ? 1 : -1)))];
    if (!next) return;
    if (visible.indexOf(next) >= limit) setLimit((l) => l + PAGE);
    setSelId(next.cluster.id);
    requestAnimationFrame(() => (listRef.current?.querySelector(`[data-id="${next.cluster.id}"]`) as HTMLElement | null)?.focus());
  }

  async function start(o: VendorOrder) {
    const id = o.cluster.id;
    setOv((m) => ({ ...m, [id]: { status: "in_progress", stage: "work_in_progress" } }));
    try {
      if (o.ticket) await api.advance(o.ticket.id, "work_in_progress");
      toast(`Work started on ${o.ticket?.id ?? "order"}`);
    } catch (e) {
      setOv((m) => { const n = { ...m }; delete n[id]; return n; });
      throw e;
    }
  }
  /** The crew submits the repair; the city (or the agent) confirms it. The order stays on the list as awaiting verification. */
  async function fix(o: VendorOrder, blob: Blob | null, url: string | null) {
    const id = o.cluster.id;
    const prev = ov[id];
    setOv((m) => ({ ...m, [id]: { status: "in_progress", stage: "work_in_progress", afterUrl: url ?? undefined, awaiting: true } }));
    rememberAwaiting(id, true);
    try { await api.fix(id, blob); }
    catch (e) {
      if (/already awaiting/i.test(e instanceof Error ? e.message : "")) return;  // submitted earlier; the order is where it should be
      rememberAwaiting(id, false);
      setOv((m) => { const n = { ...m }; if (prev) n[id] = prev; else delete n[id]; return n; });
      throw e;
    }
  }

  const live = health.data?.flags.devrev_mode === "live";
  const loadingFirst = orders.loading && !orders.data;

  const detail = current ? (
    <Detail key={current.cluster.id} order={current} afterUrl={ov[current.cluster.id]?.afterUrl} onStart={start} onFix={fix} />
  ) : null;

  return (
    <div className="vd-root">
      <aside className="vd-rail" aria-label="Filters">
        <div className="vd-search">
          <Search size={16} strokeWidth={1.75} aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search address or ticket" aria-label="Search work orders" />
        </div>

        <div className="vd-rail__group">
          <div className="vd-rail__label">Vendor</div>
          <div className="vd-rail__scroll">
            <VendorBtn name="" label="All vendors" count={Object.values(vendorCounts).reduce((a, b) => a + b, 0)} on={vendor === ""} onClick={() => setVendor("")} />
            {vendors.map((v) => <VendorBtn key={v} name={v} label={v} count={vendorCounts[v] ?? 0} on={vendor === v} onClick={() => setVendor(v)} />)}
          </div>
        </div>

        {districts.length > 0 && (
          <div className="vd-rail__group">
            <div className="vd-rail__label">District</div>
            <div className="vd-rail__scroll">
              <button className={`vd-chip ${district === "" ? "is-on" : ""}`} aria-pressed={district === ""} onClick={() => setDistrict("")}>
                <MapPin size={16} strokeWidth={1.75} aria-hidden /><span>All districts</span>
              </button>
              {districts.map((d) => (
                <button key={d} className={`vd-chip ${district === d ? "is-on" : ""}`} aria-pressed={district === d} onClick={() => setDistrict(d)}>
                  <MapPin size={16} strokeWidth={1.75} aria-hidden /><span>{d}</span><b className="t-num">{districtCounts[d] ?? 0}</b>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="vd-rail__group">
          <div className="vd-rail__label">Status</div>
          <div className="vd-rail__scroll">
            {([
              ["all", "All", Layers, counts.all], ["open", "Open", CircleDot, counts.open], ["progress", "In progress", PlayCircle, counts.progress],
              ["awaiting", "Awaiting verification", ShieldCheck, counts.awaiting], ["overdue", "Overdue", Clock, counts.overdue], ["fixed", "Fixed", CheckCheck, counts.fixed],
            ] as const).map(([id, label, Icon, n]) => (
              <button key={id} className={`vd-chip ${filter === id ? "is-on" : ""} ${id === "overdue" && n > 0 ? "is-warn" : ""}`} aria-pressed={filter === id} onClick={() => setFilter(id)}>
                <Icon size={16} strokeWidth={1.75} aria-hidden /><span>{label}</span><b className="t-num">{n}</b>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="vd-main" aria-label="Work orders">
        <header className="vd-main__head">
          <div>
            <h1 className="vd-h1">Work orders</h1>
            <p className="vd-sub">{vendor || "All vendors"}{district ? ` ${"·"} ${district}` : ""} {"·"} <span className="t-num">{counts.open + counts.progress + counts.awaiting}</span> active</p>
          </div>
          <span className="spacer" />
          <Pill variant={live ? "success" : "neutral"} size="sm" icon={<Link2 size={12} strokeWidth={1.75} />} dot={live ? "pulse" : false}
            title={live ? "Tickets are synced with DevRev" : "Tickets live on a DevRev-shaped board. Flip devrev_mode to live to sync."}>
            {live ? "Synced with DevRev" : "Ticket board · DevRev-ready"}
          </Pill>
          <SegmentedControl<Sort> size="sm" label="Sort" value={sort} onChange={setSort} options={[{ value: "priority", label: "Priority" }, { value: "due", label: "Due date" }]} />
        </header>

        <div className="vd-list-wrap">
          {loadingFirst && <div className="vd-skel" aria-busy="true">{Array.from({ length: 7 }, (_, i) => <div key={i} className="vd-skelrow"><Skeleton width={56} height={56} radius={12} /><div><Skeleton height={14} width="62%" /><Skeleton height={12} width="40%" style={{ marginTop: 10 }} /></div></div>)}</div>}
          {orders.error && !orders.data && <ErrorState title="Can't load work orders" message={orders.error} onRetry={orders.reload} />}
          {orders.error && orders.data && <div className="vd-banner" role="alert"><TriangleAlert size={16} /> Live refresh failed. Showing the last loaded list.</div>}
          {!loadingFirst && !orders.error && visible.length === 0 && (
            <EmptyState icon={<Inbox />} title={q || filter !== "all" ? "No matching work orders" : "No work orders"} description={q || filter !== "all" ? "Try a different filter or search." : "Nice work. Nothing is waiting on a crew."} />
          )}
          {visible.length > 0 && (
            <motion.ul ref={listRef} className="vd-list" role="listbox" aria-label="Work orders" onKeyDown={onKey} variants={list} initial="hidden" animate="show" key={`${vendor}|${district}|${filter}|${sort}`}>
              {visible.slice(0, limit).map((o, i) => {
                const c = o.cluster, s = stageOf(o), due = dueFor(o);
                const on = c.id === effId;
                return (
                  <motion.li key={c.id} variants={i < 12 ? item : undefined} layout={false}>
                    <button data-id={c.id} role="option" aria-selected={on} tabIndex={on || (!effId && i === 0) ? 0 : -1} className={`vd-row ${on ? "is-on" : ""}`} onClick={() => select(c.id, true)}>
                      <Photo src={c.photo_url} category={c.category} alt="" size="sm" />
                      <span className="vd-row__main">
                        <span className="vd-row__title">{fresh.has(c.id) && <b className="vd-new">New</b>}{titleOf(c)}</span>
                        <span className="vd-row__meta">
                          <TicketId id={o.ticket?.id ?? c.ticket_id} devrev={devrevOf(o.ticket)} />
                          <PriorityBadge bucket={c.bucket} size="sm" />
                          <span className="vd-row__rep" title={`${c.reporter_count} reporters`}><Users size={13} strokeWidth={1.75} aria-hidden /><span className="t-num">{c.reporter_count}</span></span>
                          <span className={`vd-due is-${due.tone}`}>{due.short}</span>
                        </span>
                        {(c.neighborhood || districtOf(c) || zonesOf(c).length > 0) && <GeoChips c={c} max={1} className="vd-row__geo" />}
                      </span>
                      <StagePill stage={s} size="sm" />
                    </button>
                  </motion.li>
                );
              })}
              {visible.length > limit && (
                <li className="vd-more"><button onClick={() => setLimit((l) => l + PAGE)}>Show {Math.min(PAGE, visible.length - limit)} more <span className="vd-faint">of {visible.length - limit} remaining</span></button></li>
              )}
            </motion.ul>
          )}
        </div>
      </main>

      {wide ? (
        <section className="vd-pane" aria-label="Order detail">
          {detail ?? (loadingFirst ? <div style={{ padding: 24 }}><Skeleton height={28} width="50%" /><Skeleton height={200} style={{ marginTop: 16 }} /></div> : <div className="vd-pane__empty"><EmptyState icon={<Building2 />} title="Select a work order" description="Use the arrow keys or click a row to see the ticket." compact /></div>)}
        </section>
      ) : (
        <Sheet open={open && !!current} onClose={() => setOpen(false)} side={phone ? "bottom" : "right"} width={600} title={current ? placeOf(current.cluster) : "Work order"}>
          {detail}
        </Sheet>
      )}
    </div>
  );
}

function VendorBtn({ name, label, count, on, onClick }: { name: string; label: string; count: number; on: boolean; onClick: () => void }) {
  return (
    <button className={`vd-vendor ${on ? "is-on" : ""}`} aria-pressed={on} onClick={onClick}>
      {name ? <Avatar name={name} size={28} /> : <span className="vd-vendor__all"><Building2 size={16} strokeWidth={1.75} aria-hidden /></span>}
      <span className="vd-vendor__name">{label}</span>
      <b className="t-num">{count}</b>
    </button>
  );
}
