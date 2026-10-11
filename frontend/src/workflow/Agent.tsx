import { useEffect, useRef, useState } from "react";
import { Bot, Camera, TriangleAlert } from "lucide-react";
import { Button, useToast } from "../components/ui";
import { compressImage } from "../lib/image";
import { devrevAfterPhoto, type AgentVerdict } from "../lib/api";
import { pctOf } from "./format";
import { useNow } from "./useLive";

/** A check that started more than this long ago and never finished (the server restarted, or the models hung). */
const CHECK_STALE_MS = 60_000;

/** The agent produced no judgment: no photo, a model failed, or the check never finished. Nothing was measured. */
const noJudgment = (a: AgentVerdict) => a.state === "recommends_review" && a.confidence === 0 && !a.reason && !a.observation;

const staleCheck = (a: AgentVerdict, now: number) => {
  const t = a.checked_at ? Date.parse(a.checked_at) : NaN;
  return a.state === "checking" && Number.isFinite(t) && now - t > CHECK_STALE_MS;
};

/** What the verification agent thinks of the fix. Hidden when there is nothing to say (none, skipped).
 *  A screen-reader summary sits in a live region that is always present, so the outcome is announced when it arrives. */
export function AgentBlock({ a }: { a: AgentVerdict | null | undefined }) {
  const now = useNow(5000);
  const shown = !!a && a.state !== "none" && a.state !== "skipped";
  const unavailable = shown && (noJudgment(a!) || staleCheck(a!, now));
  const summary = !shown ? "" : unavailable ? "Agent check unavailable. A person should decide."
    : a!.state === "checking" ? "Agent is checking the photos."
    : a!.state === "auto_approved" ? "Agent verified and closed this case."
    : a!.state === "recommends_approve" ? `Agent finished: recommends approval, ${pctOf(a!.confidence)} percent confident.`
    : "Agent finished: a person should look.";
  return (
    <>
      <span className="wf-sr" role="status" aria-live="polite" aria-atomic="true">{summary}</span>
      {shown && <AgentCard a={a!} unavailable={unavailable} stale={staleCheck(a!, now)} />}
    </>
  );
}

function AgentCard({ a, unavailable, stale }: { a: AgentVerdict; unavailable: boolean; stale: boolean }) {
  if (unavailable) {
    return (
      <section className="wf-agent is-idle" aria-label="Agent check">
        <div className="wf-agent-top">
          <span className="wf-agent-badge"><Bot aria-hidden />AGENT</span>
          <b className="wf-agent-h">{!stale && a.policy_note.startsWith("No after-photo") ? "Waiting for an after-photo" : "Agent check unavailable"}</b>
        </div>
        <p className="wf-agent-policy">{stale ? "The check did not finish. Decide yourself, or ask the crew to send it for verification again." : a.policy_note || "A person should verify."}</p>
      </section>
    );
  }

  if (a.state === "checking") {
    return (
      <section className="wf-agent is-checking" aria-label="Agent check">
        <div className="wf-agent-top">
          <span className="wf-agent-badge"><Bot aria-hidden />AGENT</span>
          <b className="wf-agent-h">Checking the photos<span className="wf-dots" aria-hidden><i>.</i><i>.</i><i>.</i></span></b>
        </div>
        <span className="wf-meter is-busy" aria-hidden><span /></span>
      </section>
    );
  }

  const kind = a.state === "recommends_approve" ? "approve" : a.state === "auto_approved" ? "done" : "review";
  const pct = pctOf(a.confidence);
  const head = kind === "approve" ? `Approve. ${pct}% confident` : kind === "review" ? "A person should look" : "Verified and closed by the agent";
  const eyebrow = kind === "done" ? "AGENT VERIFIED" : "AGENT RECOMMENDS";
  const made = [a.eyes && `Photos read by ${a.eyes}`, a.brain && `decision by ${a.brain}`].filter(Boolean).join(", ");
  return (
    <section className={`wf-agent is-${kind}`} aria-label="Agent recommendation">
      <div className="wf-agent-top">
        <span className="wf-agent-badge"><Bot aria-hidden />{eyebrow}</span>
        <b className="wf-agent-h">{head}</b>
      </div>
      {a.reason && <p className="wf-agent-reason">{a.reason}</p>}
      {a.observation && <p className="wf-agent-obs">{a.observation}</p>}
      <div className="wf-agent-conf">
        <span className="wf-agent-conf-l">Confidence</span>
        <span className="wf-meter" role="img" aria-label={`Confidence ${pct}%`}><span style={{ width: `${pct}%` }} /></span>
        <span className="wf-agent-conf-v">{pct}%</span>
      </div>
      {kind !== "done" && a.policy_note && <p className="wf-agent-policy"><b>Why a person is needed:</b> {a.policy_note}</p>}
      {made && <p className="wf-agent-foot">{made}</p>}
    </section>
  );
}

/** Crew after-photo for a case. A photo picked but not yet attached is returned through `pending`,
 *  so the caller can attach it before it requests verification. */
export function AfterPhoto({ id, url, onAttached, pendingRef, busy: outerBusy }: {
  id: string; url: string | null; onAttached: () => void; pendingRef: React.MutableRefObject<(() => Promise<boolean>) | null>; busy?: boolean;
}) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const blobRef = useRef<Blob | null>(null);
  blobRef.current = blob;

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pick = async (f?: File | null) => {
    if (!f || !f.type.startsWith("image/")) return;
    setErr(null);
    try { const b = await compressImage(f); setBlob(b); setPreview(URL.createObjectURL(b)); }
    catch (e) { setErr(e instanceof Error ? e.message : "That photo could not be read."); }
  };

  /** Resolves true when there is nothing pending or the pending photo was attached. */
  const attach = async (): Promise<boolean> => {
    const b = blobRef.current;
    if (!b) return true;
    setBusy(true); setErr(null);
    try {
      const r = await devrevAfterPhoto(id, b);
      if (!r.ok) { setErr(r.error || "The photo could not be attached."); return false; }
      toast("After-photo attached");
      setBlob(null); setPreview(null);
      onAttached();
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "The photo could not be attached.");
      return false;
    } finally { setBusy(false); }
  };
  pendingRef.current = attach;
  useEffect(() => () => { pendingRef.current = null; }, [pendingRef]);

  const shown = preview ?? url;
  return (
    <div className="wf-after">
      <div className="wf-after-row">
        <span className={`wf-after-thumb ${shown ? "" : "is-empty"}`}>
          {shown ? <img src={shown} alt={preview ? "After-photo preview" : "After-photo on file"} /> : <Camera aria-hidden />}
        </span>
        <div className="wf-after-t">
          <b>{blob ? "Ready to attach" : url ? "After-photo on file" : "No after-photo yet"}</b>
          <span>{blob ? "Attach it now, or it is attached when you request verification." : "A photo of the finished repair lets the agent check the fix."}</span>
        </div>
        <div className="wf-after-btns">
          <Button size="sm" variant="secondary" icon={<Camera />} disabled={busy || outerBusy} onClick={() => input.current?.click()}>
            {blob ? "Choose another" : url ? "Replace after-photo" : "Attach after-photo"}
          </Button>
          {blob && <Button size="sm" loading={busy} disabled={outerBusy} onClick={() => { void attach(); }}>Attach</Button>}
        </div>
        <input ref={input} type="file" accept="image/*" capture="environment" hidden
          onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      {err && <div className="wf-inline-err" role="alert"><TriangleAlert aria-hidden /><span>{err}</span></div>}
    </div>
  );
}
