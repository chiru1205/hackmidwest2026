import { useState, type ReactElement } from "react";
import { CheckCircle2, ImageOff, Play, RotateCcw, ShieldCheck, Siren, TriangleAlert } from "lucide-react";
import { Button, useToast } from "../components/ui";
import { catLabel } from "../lib/const";
import { devrevAction, type CaseAction, type CaseDetail, type DevrevActionName } from "../lib/api";

/** Labels match the old board so staff see the same words. */
const ACTION_META: Record<CaseAction, { label: string; icon: ReactElement }> = {
  start: { label: "Start work", icon: <Play /> },
  request_verification: { label: "Request verification", icon: <ShieldCheck /> },
  approve: { label: "Approve and close", icon: <CheckCircle2 /> },
  escalate: { label: "Escalate", icon: <Siren /> },
  reopen: { label: "Reopen", icon: <RotateCcw /> },
};

/** Closing a case needs evidence: a photo, an earlier note, or a note typed with the click. */
const needsEvidence = (d: CaseDetail) => d.ticket.evidence_count === 0;

function useCaseAction(id: string, onDone: () => void) {
  const toast = useToast();
  const [busy, setBusy] = useState<DevrevActionName | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const run = async (a: DevrevActionName, label: string) => {
    setBusy(a); setErr(null);
    try {
      const r = await devrevAction(id, a, note.trim() || null);
      if (!r.ok) { setErr(r.error || "That action is not available right now."); return; }
      toast(`${label}: done`);
      setNote("");
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally { setBusy(null); }
  };
  return { busy, err, note, setNote, run };
}

function Photo({ src, tone, caption }: { src: string | null; tone: "before" | "after"; caption: string }) {
  const [bad, setBad] = useState(false);
  const ok = !!src && !bad;
  return (
    <figure className={`wf-photo is-${tone} ${ok ? "" : "is-empty"}`}>
      {ok ? <img src={src!} alt={caption} onError={() => setBad(true)} /> : <span className="wf-photo-empty"><ImageOff aria-hidden />No photo yet</span>}
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

function PhonePreview({ d }: { d: CaseDetail }) {
  const n = Math.max(1, d.ticket.reporters);
  const where = d.address || [d.ticket.neighborhood, d.ticket.district].filter(Boolean).join(", ");
  return (
    <div className="wf-phone">
      <span className="wf-phone-label">{n === 1 ? "WHAT THE REPORTER WILL SEE" : "WHAT REPORTERS WILL SEE"}</span>
      <div className="wf-phone-screen" role="img" aria-label={`Preview: Fixed! The ${catLabel(d.category).toLowerCase()}${where ? ` at ${where}` : ""} was repaired.`}>
        <span className="wf-phone-app">Civic Flow</span>
        <b className="wf-phone-title">Fixed!</b>
        <span className="wf-phone-body">The {catLabel(d.category).toLowerCase()}{where ? ` at ${where}` : ""} was repaired. Thanks for speaking up.</span>
        <span className="wf-phone-pts">+ points earned</span>
      </div>
    </div>
  );
}

export function Decision({ d, onChanged }: { d: CaseDetail; onChanged: () => void }) {
  const id = d.ticket.id;
  const { busy, err, note, setNote, run } = useCaseAction(id, onChanged);
  const crew = d.ticket.vendor ?? "The crew";
  const needsNote = needsEvidence(d);
  const others = (["reopen", "escalate"] as const).filter((a) => d.can.includes(a));
  return (
    <section className="wf-card wf-decision" aria-label="Your decision">
      <div className="wf-decision-main">
        <div>
          <span className="wf-eyebrow is-amber">YOUR DECISION</span>
          <h3 className="wf-card-h">Did the crew fix it?</h3>
          <p className="wf-card-p">
            {crew}&rsquo;s fix is ready for your check. Approving closes the {d.devrev.synced ? "DevRev ticket" : "ticket"} and tells everyone who reported it.
          </p>
          {d.crew_note && <p className="wf-card-p">Note sent with the request: &ldquo;{d.crew_note}&rdquo;</p>}
        </div>
        <div className="wf-photos">
          <Photo src={d.before_photo_url} tone="before" caption="Before · citizen photo" />
          <Photo src={d.after_photo_url} tone="after" caption="After · crew photo" />
        </div>
        <div className="wf-note">
          <label htmlFor={`wf-note-${id}`}>Your note</label>
          <textarea id={`wf-note-${id}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="What did you check? For example: after photo matches the site, repair is flush with the road" />
          {needsNote && <p className="wf-hint">There is no after-photo yet. Add a note about what you checked to close this case.</p>}
        </div>
        {err && <div className="wf-inline-err" role="alert"><TriangleAlert aria-hidden /><span>{err}</span></div>}
        <div className="wf-actions">
          <Button size="lg" className="wf-approve" icon={<CheckCircle2 />} loading={busy === "approve"} disabled={(busy !== null && busy !== "approve") || (needsNote && !note.trim())}
            onClick={() => run("approve", "Approved and closed")}>Approve and close</Button>
          {others.map((a) => (
            <Button key={a} size="lg" variant="secondary" className={a === "escalate" ? "wf-danger" : ""} loading={busy === a}
              disabled={busy !== null && busy !== a} onClick={() => run(a, a === "reopen" ? "Sent back" : "Escalated")}>
              {a === "reopen" ? "Send back" : "Escalate"}
            </Button>
          ))}
        </div>
      </div>
      <PhonePreview d={d} />
    </section>
  );
}

const NEXT: Record<string, { title: string; text: string }> = {
  queued: { title: "Get a crew moving", text: "No one has started on this yet." },
  assigned: { title: "Waiting for the crew to start", text: "A crew is assigned. Start the work when they arrive." },
  in_progress: { title: "The crew is on site", text: "When the work is done, mark it ready for your check." },
  awaiting_verification: { title: "Waiting on verification", text: "The fix has been submitted." },
  resolved: { title: "This case is closed", text: "Reopen it if the problem comes back." },
};

export function NextStep({ d, onChanged }: { d: CaseDetail; onChanged: () => void }) {
  const id = d.ticket.id;
  const { busy, err, note, setNote, run } = useCaseAction(id, onChanged);
  const meta = NEXT[d.ticket.stage_key] ?? { title: "Next step", text: "" };
  const acts = d.can;
  const wantsNote = acts.some((a) => a !== "start");
  const needsNote = acts.includes("approve") && needsEvidence(d);
  return (
    <section className="wf-card wf-next" aria-label="Next step">
      <div className="wf-next-main">
        <span className="wf-eyebrow">NEXT STEP</span>
        <h3 className="wf-card-h is-sm">{meta.title}</h3>
        <p className="wf-card-p">{meta.text}{d.ticket.reporters > 1 && d.ticket.stage_key !== "resolved" ? ` Everyone who reported it will be told once it is fixed.` : ""}</p>
      </div>
      {wantsNote && (
        <div className="wf-note">
          <label htmlFor={`wf-note-${id}`}>{needsNote ? "Note" : "Note (optional)"}</label>
          <textarea id={`wf-note-${id}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add context for this step" />
          {needsNote && <p className="wf-hint">To close this case without an after-photo, add a note about what you checked.</p>}
        </div>
      )}
      {err && <div className="wf-inline-err" role="alert"><TriangleAlert aria-hidden /><span>{err}</span></div>}
      {acts.length === 0 ? (
        <p className="wf-card-p">No actions are available right now.</p>
      ) : (
        <div className="wf-actions">
          {acts.map((a, i) => (
            <Button key={a} variant={i === 0 ? "primary" : "secondary"} icon={ACTION_META[a].icon} loading={busy === a}
              disabled={(busy !== null && busy !== a) || (a === "approve" && needsNote && !note.trim())}
              onClick={() => run(a, ACTION_META[a].label)}>
              {ACTION_META[a].label}
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}
