// Where THIS PACKAGE'S WIDGET persists a viewer's flat preferences: the sticky symbol and timeframe,
// the scale mode, the legend's hidden studies, the replay speed. A pluggable seam so a host chooses
// the backing store: an in-memory store (the default, and the right one for SSR, tests and an
// ephemeral embed), or a host-supplied adapter that writes to the host's own per-user backend. A
// browser's localStorage is one such adapter a host may write in a few lines; it is not part of
// this package, because a device-local default is not the public persistence architecture and must
// never become a client's authority. The WIDGET only ever calls this narrow surface, so its
// preference persistence is fully redirectable. Saved charts, layouts, drawings and templates are
// NOT preferences: they are revisioned resources on `ChartSaveLoadAdapter` (resources.ts).
//
// Keys are opaque strings in the package's own `quickcharts.` namespace; values are opaque strings
// (JSON the chart owns). An adapter must treat both as opaque — no parsing, no per-key logic — so
// the chart can evolve its formats freely.

export interface ChartStorage {
  /** The stored value for a key, or null when absent. Must not throw — a backing-store failure reads as
   *  "absent" so the chart falls back to its defaults rather than crashing. */
  get(key: string): string | null
  /** Persist a value. Must not throw — a quota/permission failure is swallowed (the chart keeps working
   *  off in-memory state for the session). */
  set(key: string, value: string): void
  /** Remove a key. Must not throw. */
  remove(key: string): void
  /** Every key currently present, so the chart can enumerate its own namespace. Order is unspecified. */
  keys(): string[]
}

/** An in-memory ChartStorage — the default, and the store for SSR, tests, or an intentionally ephemeral
 *  embed where nothing should persist beyond the page. A host can also seed one from its own state to
 *  hand the chart a starting set. */
export function memoryChartStorage(seed?: Record<string, string>): ChartStorage {
  const map = new Map<string, string>(seed ? Object.entries(seed) : [])
  return {
    get: (key) => map.get(key) ?? null,
    set: (key, value) => void map.set(key, value),
    remove: (key) => void map.delete(key),
    keys: () => [...map.keys()],
  }
}
