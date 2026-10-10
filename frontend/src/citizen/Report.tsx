import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, Check, ImagePlus, LoaderCircle, LocateFixed, MapPinOff, RefreshCw, RotateCcw, School, Send, ShieldAlert, Siren, TriangleAlert, X } from "lucide-react";
import type { Category, ReportResult } from "@contracts";
import { api, fetchGeofence, type GeofenceInfo, type GeoZone } from "../lib/api";
import { CATEGORIES, PRESETS, catLabel } from "../lib/const";
import { compressImage, UnsupportedImageError } from "../lib/image";
import { Button, Pill, spring } from "../components/ui";
import { CatIcon } from "./common";
import { useOverlayRoot } from "./overlay";
import { useLoc } from "./loc";
import PinMap from "./PinMap";
import Reveal from "./Reveal";
import { insertFromResult } from "./requestsStore";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SCAN_STEPS = ["Uploading your report", "Checking the area", "Scoring priority", "Dispatching a crew"];
const SEVERITY = ["Minor", "Noticeable", "Real problem", "Serious", "Dangerous"];

const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const locHint = () => {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "On iPhone: Settings > Privacy & Security > Location Services > Safari Websites > While Using.";
  if (/Android/i.test(ua)) return "On Android: tap the lock icon in the address bar > Permissions > Location > Allow.";
  return "On desktop: click the lock icon in the address bar and set Location to Allow, then tap Try again.";
};

export default function Report() {
  const { loc, status, demoOn, mapCenter, setPin, override, clearOverride, retry, useMyLocation } = useLoc();
  const [geo, setGeo] = useState<GeofenceInfo | null>(null);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const overlay = useOverlayRoot();
  const nav = useNavigate();
  const { search } = useLocation();
  const [category, setCategory] = useState<Category>("pothole");
  const [note, setNote] = useState("");
  const [severity, setSeverity] = useState(3);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [explicit, setExplicit] = useState(false);
  const [sugg, setSugg] = useState<{ category: Category; confidence: number; source: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanStep, setScanStep] = useState(0);
  const [photoInfo, setPhotoInfo] = useState<{ name: string; size: number } | null>(null);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const [revealPhoto, setRevealPhoto] = useState<string | null>(null);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const libRef = useRef<HTMLInputElement>(null);

  // geofence lookup for the chosen spot: debounced, last result kept while the next one loads
  useEffect(() => {
    let live = true;
    if (!loc) { setGeo(null); return () => { live = false; }; }
    const t = setTimeout(() => { fetchGeofence(loc.lat, loc.lng).then((g) => { if (live) setGeo(g); }); }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [loc?.lat, loc?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  const outside = geo?.in_service_area === false;
  const blocked = !loc || (outside && !demoOn);

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

  useEffect(() => () => { if (revealPhoto) URL.revokeObjectURL(revealPhoto); }, [revealPhoto]);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setPhotoErr(null);
    try {
      const blob = await compressImage(f);
      setPhoto(blob);
      setPhotoInfo({ name: f.name || "photo.jpg", size: blob.size });
      setPreview(URL.createObjectURL(blob));
    } catch (e) {
      setPhotoErr(e instanceof UnsupportedImageError ? e.message : "This photo format isn't supported here. Choose a JPEG or PNG, or take the photo with the camera.");
    }
  }
  const removePhoto = () => { setPhoto(null); setPreview(null); setPhotoInfo(null); setPhotoErr(null); };

  async function run(call: () => Promise<ReportResult>, after?: () => void) {
    setError(null); setScanning(true); setScanStep(0);
    let done = false;   // on a slow network the steps wait at "Uploading" instead of pretending to finish
    const tick = setInterval(() => setScanStep((s) => Math.min(done ? SCAN_STEPS.length - 1 : 0, s + 1)), 380);
    try {
      const [res] = await Promise.all([call().finally(() => { done = true; }), sleep(1500)]);
      setResult(res);
      after?.();
    } catch (e) {
      const m = String((e as Error).message ?? e);
      setError(/failed to fetch|networkerror|load failed|network request/i.test(m) ? "We couldn't reach the server. Check your connection and try again. Your photo and details are kept." : m);
    } finally {
      clearInterval(tick); setScanning(false);
    }
  }

  const submit = () => {
    if (!loc) return;
    const sent = photo;
    return run(
      async () => {
        const r = await api.submitReport({ lat: loc.lat, lng: loc.lng, accuracy_m: loc.accuracy_m, category, note, severity, photo, demoOverride: demoOn });
        insertFromResult(r, { photo: sent, note, category, severity });
        return r;
      },
      () => { setRevealPhoto(sent ? URL.createObjectURL(sent) : null); setNote(""); setPhoto(null); setPreview(null); setPhotoInfo(null); },
    );
  };

  const accuracyBad = !!loc && loc.accuracy_m > 100;
  const srcLabel = loc?.source === "gps" ? "Your GPS" : loc?.source === "pin" ? "Pinned by you" : "Demo location";
  const pinned = loc && (loc.source === "pin" || loc.source === "override") ? { lat: loc.lat, lng: loc.lng } : null;
  const gpsDot = loc?.source === "gps" ? { lat: loc.lat, lng: loc.lng } : null;
  const whyDisabled = !loc ? "Allow location or place the pin" : "Move the pin inside Kansas City to send a report.";

  return (
    <div className="cz-page cz-report">
      <header className="cz-head">
        <h1 className="cz-title">See something?<br />Snap it.</h1>
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

      {photoErr && (
        <div className="cz-err" role="alert"><TriangleAlert size={18} strokeWidth={1.75} aria-hidden /><span>{photoErr}</span></div>
      )}
      {photoInfo && preview && (
        <div className="cz-file" aria-label="Selected photo">
          <Check size={14} strokeWidth={2.5} aria-hidden />
          <span className="cz-file__name">{photoInfo.name}</span>
          <span className="cz-file__size t-mono">{fmtSize(photoInfo.size)}</span>
          <button type="button" className="cz-file__rm" onClick={removePhoto}><X size={14} strokeWidth={2} aria-hidden /> Remove photo</button>
        </div>
      )}

      {/* location */}
      <section className="cz-card cz-loc" aria-label="Location">
        <div className="cz-loc__row">
          <span className="cz-loc__icon">{status === "locating" && !loc ? <LoaderCircle size={18} strokeWidth={1.75} className="cz-spin" aria-hidden /> : <LocateFixed size={18} strokeWidth={1.75} aria-hidden />}</span>
          <div className="cz-loc__txt">
            {loc ? (
              <>
                <b>{geo?.in_service_area ? (geo.neighborhood ?? "Your location") : outside ? "Outside Kansas City" : "Your location"}</b>
                <span className="t-mono">{loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}</span>
              </>
            ) : status === "locating" ? (
              <b role="status">Finding your location...</b>
            ) : (
              <b>Location is off</b>
            )}
          </div>
          {loc && (
            <Pill variant={accuracyBad ? "hazard" : "success"} size="sm" dot={loc.source === "gps" ? "pulse" : true}>
              {accuracyBad ? `Low accuracy ±${Math.round(loc.accuracy_m)} m` : loc.source === "gps" ? `${srcLabel} ±${Math.max(1, Math.round(loc.accuracy_m))} m` : srcLabel}
            </Pill>
          )}
        </div>
        {!loc && status === "denied" && (
          <div className="cz-out" role="alert">
            <span className="cz-out__ic"><MapPinOff size={18} strokeWidth={1.75} aria-hidden /></span>
            <div className="cz-out__txt">
              <b>Location is off. Allow location in your browser, or place the pin on the map.</b>
              <span>{locHint()}</span>
              <button type="button" className="cz-out__btn" onClick={retry}><RefreshCw size={13} strokeWidth={2} aria-hidden /> Try again</button>
            </div>
          </div>
        )}
        {demoOn && (
          <button type="button" className="cz-demochip" onClick={clearOverride}>Demo location active - tap to use real GPS</button>
        )}
        {loc && loc.source !== "gps" && !demoOn && (
          <button type="button" className="cz-uselocbtn" onClick={useMyLocation}><LocateFixed size={14} strokeWidth={2} aria-hidden /> Use my location</button>
        )}
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
        <PinMap center={mapCenter} pin={pinned} you={gpsDot} onPin={setPin} />
        <div className="cz-loc__hint t-caption">Tap the map to place the pin, then drag it to fix the spot.</div>
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
        <div className="cz-err" role="alert"><TriangleAlert size={18} strokeWidth={1.75} aria-hidden /><span>{error}</span>
          <button type="button" className="cz-err__retry" onClick={submit}><RefreshCw size={13} strokeWidth={2} aria-hidden /> Retry</button></div>
      )}

      <div className="cz-sendbar">
        <Button size="lg" block variant="primary" loading={scanning} disabled={blocked} icon={<Send />} onClick={submit}>
          Send report
        </Button>
        {blocked && <p className="cz-sendbar__why t-caption">{whyDisabled}</p>}
      </div>

      {overlay && createPortal(
        <AnimatePresence>
          {scanning && <Scan key="scan" preview={preview} step={scanStep} />}
        </AnimatePresence>, overlay)}
      {overlay && result && createPortal(
        <Reveal result={result} localPhoto={revealPhoto} onClose={() => setResult(null)} onSee={(id) => { setResult(null); nav({ pathname: `/requests/${id}`, search }); }} />, overlay)}
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
