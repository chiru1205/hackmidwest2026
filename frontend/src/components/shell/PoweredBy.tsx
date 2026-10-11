/** The sponsor ribbon: shown under the header on every page, big and bold. */
export function PoweredBy({ className = "" }: { className?: string }) {
  return (
    <div className={`powered ${className}`} role="note" aria-label="Powered by DevRev and Akamai">
      <span className="powered__item"><em>Powered by</em> <b>DevRev</b></span>
      <i className="powered__dot" aria-hidden="true" />
      <span className="powered__item"><em>Powered by</em> <b>Akamai</b></span>
    </div>
  );
}
