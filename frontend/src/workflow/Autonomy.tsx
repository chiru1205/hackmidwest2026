import { Bot } from "lucide-react";
import { SegmentedControl } from "../components/ui";
import type { AutonomyPolicy } from "../lib/api";
import { joinList, pctOf } from "./format";

/** The server's rules start with a capital ("Safety hazards"); mid-sentence they read lower-case, except names like P1. */
const lower = (s: string) => (/^[A-Z][A-Z0-9]/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

type Mode = AutonomyPolicy["mode"];
const MODES = [{ value: "off", label: "Off" }, { value: "suggest", label: "Suggest" }, { value: "auto", label: "Auto" }] as const;

/** One plain sentence built from the server's policy values, so the page never states a rule the server does not enforce. */
export function policySentence(p: AutonomyPolicy): string {
  const buckets = p.auto_buckets.length ? joinList(p.auto_buckets) : "no";
  const human = p.always_human.length ? ` A person always decides: ${p.always_human.map(lower).join("; ")}.` : "";
  return `In Auto mode the agent closes ${buckets} cases it is at least ${pctOf(p.min_confidence)}% sure are fixed.${human}`;
}

export function AutonomyCard({ policy, onMode, busy }: { policy: AutonomyPolicy; onMode: (m: Mode) => void; busy: boolean }) {
  return (
    <section className="wf-auto" aria-label="Agent autonomy" aria-busy={busy || undefined}>
      <div className="wf-auto-l">
        <span className="wf-auto-t"><Bot aria-hidden />Agent autonomy</span>
        <SegmentedControl<Mode> size="sm" label="Agent autonomy" value={policy.mode} onChange={onMode} options={[...MODES]} />
      </div>
      <p className="wf-auto-p">{policySentence(policy)}</p>
      <p className="wf-auto-n">
        Closed by agent <b>{policy.closed_by_agent.toLocaleString()}</b>, recommended <b>{policy.recommended.toLocaleString()}</b>
      </p>
    </section>
  );
}
