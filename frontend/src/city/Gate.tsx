import { useState } from "react";
import { Lock } from "lucide-react";
import { unlockStaff } from "../lib/auth";
import { LogoMark, Wordmark } from "../components/shell/Logo";
import { PoweredBy } from "../components/shell/PoweredBy";

/** Demo-level staff sign-in. Not real security: the PIN is shown as a hint. */
export default function Gate({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (unlockStaff(pin)) { setErr(false); onUnlock(); } else { setErr(true); }
  };

  return (
    <>
    <PoweredBy />
    <div className="gate">
      <form className="gate__card" onSubmit={submit} aria-labelledby="gate-h">
        <div className="gate__brand"><LogoMark size={36} /><Wordmark /></div>
        <h1 id="gate-h" className="gate__h">City staff sign-in</h1>
        <p className="gate__p">Operations, vendors and workflow are for City of Kansas City staff.</p>
        <label className="gate__label" htmlFor="gate-pin">Staff PIN</label>
        <div className={`gate__field ${err ? "is-err" : ""}`}>
          <Lock aria-hidden />
          <input
            id="gate-pin" type="password" autoComplete="off" autoFocus
            value={pin} onChange={(e) => { setPin(e.target.value); setErr(false); }}
            aria-invalid={err} aria-describedby={err ? "gate-err" : "gate-hint"} placeholder="Enter PIN"
          />
        </div>
        {err
          ? <p id="gate-err" className="gate__err" role="alert">That PIN is not right. Try again.</p>
          : <p id="gate-hint" className="gate__hint">Demo PIN: city</p>}
        <button type="submit" className="gate__btn" disabled={!pin}>Sign in</button>
      </form>
    </div>
    </>
  );
}
