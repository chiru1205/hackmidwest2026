import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, Check, ImagePlus, LocateFixed, MapPinOff, RotateCcw, School, Send, ShieldAlert, Siren, TriangleAlert, Users } from "lucide-react";
import type { Category, Cluster, EdgeInfo, ReportResult } from "@contracts";
import { useSearchParams } from "react-router-dom";
import { api, fetchGeofence, type GeofenceInfo, type GeoZone } from "../lib/api";
import { CATEGORIES, PRESETS, catLabel } from "../lib/const";
import { compressImage } from "../lib/image";
import { AvatarStack, Button, Pill, PriorityBadge, TicketId, spring } from "../components/ui";
import { CatIcon, EdgePill, NEIGHBOR_NAMES, Photo, photoFor, shortAddr } from "./common";
import { useOverlayRoot } from "./overlay";
import { useLoc } from "./loc";
import PinMap from "./PinMap";
import Reveal from "./Reveal";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SCAN_STEPS = ["Reading the photo", "Checking for neighbor reports", "Scoring priority", "Dispatching a crew"];
const SEVERITY = ["Minor", "Noticeable", "Real problem", "Serious", "Dangerous"];

export default function Report() {
  const { loc, setPin, override } = useLoc();
  const [sp] = useSearchParams();
  const [geo, setGeo] = useState<GeofenceInfo | null>(null);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const demoOn = sp.get("demo") === "1" || loc.source === "override";
  const overlay = useOverlayRoot();
  const [category, setCategory] = useState<Category>("pothole");
  const [note, setNote] = useState("");
  const [severity, setSeverity] = useState(3);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [nearby, setNearby] = useState<Cluster[]>([]);
  const [nearLoaded, setNearLoaded] = useState(false);
  const [edge, setEdge] = useState<EdgeInfo | null>(null);
  const [explicit, setExplicit] = useState(false);
  const [sugg, setSugg] = useState<{ category: Category; confidence: number; source: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanStep, setScanStep] = useState(0);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const libRef = useRef<HTMLInputElement>(null);

  const loadNearby = () =>
    api.nearby(loc.lat, loc.lng, category).then((r) => { setNearby(r.clusters); setEdge(r.edge); setNearLoaded(true); })
      .catch(() => { setNearby([]); setEdge(null); setNearLoaded(true); });

  // live nearby check, debounced; served from the in-memory geo cache
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      api.nearby(loc.lat, loc.lng, category).then((r) => { if (live) { setNearby(r.clusters); setEdge(r.edge); setNearLoaded(true); } })
        .catch(() => { if (live) { setNearby([]); setEdge(null); setNearLoaded(true); } });
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [loc.lat, loc.lng, category]);

  // geofence lookup for the chosen spot: debounced, last result kept while the next one loads
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => { fetchGeofence(loc.lat, loc.lng).then((g) => { if (live) setGeo(g); }); }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [loc.lat, loc.lng]);
  const outside = geo?.in_service_area === false;
  const blocked = outside && !demoOn;

  // category suggestion from the note (endpoint may not exist yet: stay silent)
  useEffect(() => {
    const text = note.trim();
    if (explicit || text.length < 8) { setSugg(null); return; }
    let live = true;
    const t = setTimeout(() => {
      fetch(`/api/suggest?text=${encodeURIComponent(text)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (live) setSugg(j && j.category && CATEGORIES.some((c) => c.id === j.category) ? j : null); })
        .catch(() => { if (live) setSugg(null); });
    }, 500);
    return () => { live = false; clearTimeout(t); };
  }, [note, explicit]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function onFile(f: File | undefined) {
    if (!f) return;
    const blob = await compressImage(f);
    setPhoto(blob);
    setPreview(URL.createObjectURL(blob));
  }

  async function run(call: () => Promise<ReportResult>, after?: () => void) {
    setError(null); setScanning(true); setScanStep(0);
    const tick = setInterval(() => setScanStep((s) => Math.min(SCAN_STEPS.length - 1, s + 1)), 380);
    try {
      const [res] = await Promise.all([call(), sleep(1500)]);
      setResult(res);
      after?.();
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      clearInterval(tick); setScanning(false);
    }
  }

  const submit = () => run(
    () => api.submitReport({ lat: loc.lat, lng: loc.lng, accuracy_m: loc.accuracy_m, category, note, severity, photo, demoOverride: demoOn }),
    () => { setNote(""); setPhoto(null); setPreview(null); },
  );
  const meToo = (c: Cluster) => run(() => api.confirm(c.id, loc.lat, loc.lng, loc.accuracy_m));

  const best = nearby[0];
  const accuracyBad = loc.accuracy_m > 100;
  const srcLabel = loc.source === "gps" ? "GPS" : loc.source === "demo" ? "Demo location" : "Pinned";

  return (
    <div className="cz-page cz-report">
      <header className="cz-head">
        <h1 className="cz-title">See something?<br />Snap it.</h1>
        <EdgePill edge={edge} />
      </header>

      {/* camera hero */}
      <section className={`cz-cam ${preview ? "has-photo" : ""}`} aria-label="Photo">
        {preview ? (
          <>
            <img src={preview} alt="Your photo" className="cz-cam__img" />
            <span className="cz-cam__scan" aria-hidden />
            <span className="cz-cam__corners" aria-hidden><i /><i /><i /><i /></span>
            <button type="button" className="cz-glassbtn cz-cam__retake" onClick={() => camRef.current?.click()}>
              <RotateCcw size={16} strokeWidth={1.75} aria-hidden /> Retake
            </button>
            <span className="cz-cam__tag"><Check size={14} strokeWidth={2.5} aria-hidden /> Photo attached</span>
          </>
        ) : (
          <>
            <div className="cz-cam__grid" aria-hidden />
            <svg className="cz-cam__lines" viewBox="0 0 358 250" aria-hidden preserveAspectRatio="none">
              <path d="M-10 30 C 50 30, 90 70, 179 70" /><path d="M-10 120 C 40 120, 80 80, 179 70" />
              <path d="M368 30 C 308 30, 268 70, 179 70" /><path d="M368 120 C 318 120, 278 80, 179 70" />
            </svg>
            <motion.button type="button" className="cz-shutter" onClick={() => camRef.current?.click()} aria-label="Take a photo"
              whileTap={{ scale: 0.94 }} transition={spring.pop}>
              <span className="cz-shutter__ring" aria-hidden />
              <Camera size={34} strokeWidth={1.6} aria-hidden />
            </motion.button>
            <div className="cz-cam__copy">
              <b>Snap the problem</b>
              <span>A photo helps the crew find it fast</span>
            </div>
            <button type="button" className="cz-cam__lib" onClick={() => libRef.current?.click()}>
              <ImagePlus size={16} strokeWidth={1.75} aria-hidden /> Choose from library
            </button>
          </>
        )}
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={libRef} type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      </section>

      {/* location */}
      <section className="cz-card cz-loc" aria-label="Location">
        <div className="cz-loc__row">
          <span className="cz-loc__icon"><LocateFixed size={18} strokeWidth={1.75} aria-hidden /></span>
          <div className="cz-loc__txt">
            <b>{geo?.in_service_area ? (geo.neighborhood ?? best?.neighborhood ?? "Your location") : outside ? "Outside Kansas City" : (best?.neighborhood ?? "Your location")}{best?.address ? ` · ${shortAddr(best.address)}` : ""}</b>
            <span className="t-mono">{loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}</span>
          </div>
          <Pill variant={accuracyBad ? "hazard" : "success"} size="sm" dot={loc.source === "gps" ? "pulse" : true}>
            {accuracyBad ? "Too imprecise" : `${srcLabel} ±${Math.max(1, Math.round(loc.accuracy_m))} m`}
          </Pill>
        </div>
        <GeoChips geo={geo} />
        {outside && (
          <div className="cz-out" role="status">
            <span className="cz-out__ic"><MapPinOff size={18} strokeWidth={1.75} aria-hidden /></span>
            <div className="cz-out__txt">
              <b>You're outside the Kansas City service area</b>
              <span>{geo?.message ?? "Civic Flow covers Kansas City, Missouri for now."}</span>
              <button type="button" className="cz-out__btn" aria-expanded={presetsOpen} onClick={() => setPresetsOpen((o) => !o)}>Use a demo location</button>
              {presetsOpen && (
                <div className="cz-out__presets">
                  {PRESETS.map((p) => <button key={p.name} type="button" onClick={() => { override(p.lat, p.lng); setPresetsOpen(false); }}>{p.name}</button>)}
                </div>
              )}
            </div>
          </div>
        )}
        <PinMap lat={loc.lat} lng={loc.lng} onPin={setPin} clusters={nearby} />
        <div className="cz-loc__hint t-caption">Drag the pin or tap the map to fix the spot.</div>
      </section>

      {/* category */}
      <section aria-labelledby="cz-cat">
        <h2 className="cz-sec" id="cz-cat">What is it?</h2>
        <div className="cz-cats" role="radiogroup" aria-labelledby="cz-cat">
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={category === c.id} className={`cz-cat ${category === c.id ? "is-on" : ""}`} onClick={() => { setExplicit(true); setSugg(null); setCategory(c.id); }}>
              <span className="cz-cat__ic"><CatIcon cat={c.id} size={22} /></span>
              <span className="cz-cat__lbl">{c.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* nearby */}
      <AnimatePresence initial={false}>
        {best && (
          <motion.section key={best.id} className="cz-near" role="status" aria-label="Already reported nearby"
            initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={spring.soft}>
            <div className="cz-near__top">
              <Photo src={photoFor(best)} cat={best.category} className="cz-near__photo" />
              <div className="cz-near__info">
                <span className="cz-near__eyebrow"><span className="cz-livedot" aria-hidden /> Already reported nearby</span>
                <b className="cz-near__count t-num">{best.reporter_count.toLocaleString("en-US")} {best.reporter_count === 1 ? "neighbor" : "neighbors"}</b>
                <div className="cz-near__meta">
                  <PriorityBadge bucket={best.bucket} size="sm" />
                  <TicketId id={best.ticket_id} />
                </div>
                <div className="cz-near__who">
                  <AvatarStack names={NEIGHBOR_NAMES} total={best.reporter_count} max={3} size={28} />
                </div>
              </div>
            </div>
            <Button block size="lg" loading={scanning} icon={<Users />} onClick={() => meToo(best)}>
              Me too <span className="cz-xp">+5 XP</span>
            </Button>
          </motion.section>
        )}
      </AnimatePresence>
      {!best && nearLoaded && (
        <div className="cz-first" role="status"><span className="cz-first__dot" aria-hidden /> Nobody has reported this here yet. You could be the first responder.</div>
      )}

      {/* note + severity */}
      <section>
        <label className="cz-sec" htmlFor="cz-note">Anything we should know?</label>
        <textarea id="cz-note" className="cz-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Deep hole in the right lane" />
        <AnimatePresence>
          {!explicit && sugg && sugg.confidence >= 0.5 && sugg.category !== category && (
            <motion.button key={sugg.category} type="button" className="cz-suggest" initial={{ opacity: 0, y: 6, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={spring.snappy}
              onClick={() => { setCategory(sugg.category); setSugg(null); }}>
              <span className="cz-suggest__ic"><CatIcon cat={sugg.category} size={14} /></span>
              <span>Looks like {catLabel(sugg.category)}. Use this?</span>
              {sugg.source === "akamai-embedding" && <span className="cz-suggest__src">suggested by Akamai AI</span>}
            </motion.button>
          )}
        </AnimatePresence>
      </section>

      <section aria-labelledby="cz-sev">
        <div className="cz-sec cz-sec--row" id="cz-sev"><span>How bad is it?</span><b key={severity} className="cz-sev__now">{SEVERITY[severity - 1]}</b></div>
        <div className="cz-sev" role="radiogroup" aria-labelledby="cz-sev">
          <span className="cz-sev__track" aria-hidden><motion.i initial={false} animate={{ width: `${((severity - 1) / 4) * 100}%` }} transition={spring.snappy} /></span>
          {SEVERITY.map((l, i) => (
            <button key={l} type="button" role="radio" aria-checked={severity === i + 1} aria-label={`${i + 1} of 5, ${l}`} className={`cz-sev__st ${severity >= i + 1 ? "is-on" : ""} ${severity === i + 1 ? "is-cur" : ""}`} onClick={() => setSeverity(i + 1)}>
              <i>{i + 1}</i>
            </button>
          ))}
        </div>
      </section>

      {error && (
        <div className="cz-err" role="alert"><TriangleAlert size={18} strokeWidth={1.75} aria-hidden /><span>{error}</span></div>
      )}

      <div className="cz-sendbar">
        <Button size="lg" block variant={best ? "secondary" : "primary"} loading={scanning} disabled={blocked} icon={<Send />} onClick={submit}>
          {best ? "Report it separately" : "Send report"}
        </Button>
        {blocked && <p className="cz-sendbar__why t-caption">Move the pin inside Kansas City to send a report.</p>}
      </div>

      {overlay && createPortal(
        <AnimatePresence>
          {scanning && <Scan key="scan" preview={preview} step={scanStep} />}
        </AnimatePresence>, overlay)}
      {overlay && result && createPortal(
        <Reveal result={result} onClose={() => { setResult(null); loadNearby(); }} />, overlay)}
    </div>
  );
}

const ZONE_ICON = { school: School, hospital: Siren, arterial: ShieldAlert } as const;
const ZONE_LABEL = { school: "School zone", hospital: "Hospital zone", arterial: "Priority corridor" } as const;

function GeoChips({ geo }: { geo: GeofenceInfo | null }) {
  if (!geo || !geo.in_service_area) return null;
  const area = [geo.neighborhood, geo.district ? (/^district/i.test(geo.district) ? geo.district : `District ${geo.district}`) : null].filter(Boolean).join(" · ");
  if (!area && !geo.zones.length) return null;
  return (
    <div className="cz-geo" aria-label="Area and priority zones">
      {area && <Pill variant="neutral" size="sm">{area}</Pill>}
      {geo.zones.map((z: GeoZone) => {
        const Ic = ZONE_ICON[z.type] ?? ShieldAlert;
        return <span key={z.type + z.name} className="cz-zone" title={`${z.distance_m} m away, zone radius ${z.radius_m} m`}><Ic size={13} strokeWidth={2} aria-hidden /> {ZONE_LABEL[z.type] ?? "Zone"}: {z.name} &middot; priority boost</span>;
      })}
    </div>
  );
}

function Scan({ preview, step }: { preview: string | null; step: number }) {
  return (
    <motion.div className="cz-scan" data-theme="light" role="status" aria-live="polite" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
      {preview && <img src={preview} alt="" className="cz-scan__bg" />}
      <div className="cz-scan__body">
        <div className="cz-scan__orb" aria-hidden><i /><i /><i /><b><ScanDot /></b></div>
        <h2 className="cz-scan__h">Reading your report</h2>
        <ul className="cz-scan__steps">
          {SCAN_STEPS.map((s, i) => (
            <li key={s} className={i < step ? "is-done" : i === step ? "is-now" : ""}>
              <span>{i < step ? <Check size={12} strokeWidth={3} aria-hidden /> : null}</span>{s}
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}
const ScanDot = () => <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="3.2" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></svg>;
