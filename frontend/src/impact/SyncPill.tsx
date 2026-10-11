import { LATE_AFTER } from "./useFeed";

type Phase = "connecting" | "paused" | "late" | "live";

/** Freshness of a polled page. The visible text ticks every second, so it is hidden from assistive tech; a separate
 *  live region says something only when the state changes (connecting, live, delayed, paused). */
export function SyncPill({ hasData, error, ago, pollMs }: { hasData: boolean; error: string | null; ago: number | null; pollMs: number }) {
  const paused = error != null && hasData;
  const late = !paused && ago != null && ago * 1000 > LATE_AFTER * pollMs;   // no refresh for several polls, yet no error either
  const phase: Phase = paused ? "paused" : ago == null ? "connecting" : late ? "late" : "live";
  const text = phase === "paused" ? "Refresh paused, retrying" : phase === "connecting" ? "Connecting"
    : phase === "late" ? `Updates delayed · last update ${ago} s ago` : `Live · updated ${ago! < 1 ? "just now" : `${ago} s ago`}`;
  const say: Record<Phase, string> = { connecting: "", live: "Live updates on", late: "Updates are delayed", paused: "Refresh paused, retrying" };
  return (
    <>
      <span className={`im-sync ${paused || late ? "is-warn" : hasData ? "is-ok" : ""}`}>
        <i aria-hidden />
        {text}
      </span>
      <span className="im-sr" role="status" aria-live="polite">{say[phase]}</span>
    </>
  );
}
