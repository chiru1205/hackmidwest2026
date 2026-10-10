/** A real submission should be easy to find: anything reported in the last few minutes is pinned to the top of a list. */
export const FRESH_MS = 10 * 60 * 1000;

export function pinFresh<T>(rows: T[], ts: (r: T) => string, key: (r: T) => string, skip: (r: T) => boolean = () => false, max = 3): { rows: T[]; fresh: Set<string> } {
  const now = Date.now();
  const fresh = rows
    .filter((r) => !skip(r) && now - +new Date(ts(r)) < FRESH_MS)
    .sort((a, b) => +new Date(ts(b)) - +new Date(ts(a)))
    .slice(0, max);
  const ids = new Set(fresh.map(key));
  return { rows: ids.size ? [...fresh, ...rows.filter((r) => !ids.has(key(r)))] : rows, fresh: ids };
}
