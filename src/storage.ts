// Where THIS PACKAGE'S WIDGET persists a viewer's state (today: the sticky symbol + timeframe).
// A pluggable seam so a host chooses the backing store: the browser's localStorage (the default, and how
// a self-hosted deployment keeps state per device), an in-memory store (SSR, tests, an ephemeral embed),
// or a host-supplied adapter that writes to the host's own per-user backend (the cross-device story — a
// host maps these keys to its account store). The WIDGET only ever calls this narrow surface — it never
// reaches for `localStorage` directly, so the widget's persistence is fully redirectable. Scope stated
// honestly: the trdrs app's own richer chart panel persists its drawings/indicators/appearance through
// its own storage + sync machinery, OUTSIDE this seam.
//
// Keys are opaque `trdrs.chart.*` strings; values are opaque strings (JSON the chart owns). An adapter
// must treat both as opaque — no parsing, no per-key logic — so the chart can evolve its formats freely.

export interface ChartStorage {
  /** The stored value for a key, or null when absent. Must not throw — a backing-store failure reads as
   *  "absent" so the chart falls back to its defaults rather than crashing. */
  get(key: string): string | null
  /** Persist a value. Must not throw — a quota/permission failure is swallowed (the chart keeps working
   *  off in-memory state for the session). */
  set(key: string, value: string): void
  /** Remove a key. Must not throw. */
  remove(key: string): void
  /** Every key currently present, so the chart can enumerate its own namespace (e.g. list saved
   *  templates). Order is unspecified. */
  keys(): string[]
}

/** The default: the browser's localStorage, every operation guarded so a disabled/quota-exceeded store
 *  degrades to "no persistence this session" rather than throwing into the chart. */
export const localStorageChartStorage: ChartStorage = {
  get(key) {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value)
    } catch {
      /* quota / storage disabled — session-only from here */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* nothing to do */
    }
  },
  keys() {
    try {
      const out: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k != null) out.push(k)
      }
      return out
    } catch {
      return []
    }
  },
}

/** An in-memory ChartStorage — for SSR, tests, or an intentionally ephemeral embed where nothing should
 *  persist beyond the page. A host can also seed one from its own state to hand the chart a starting set. */
export function memoryChartStorage(seed?: Record<string, string>): ChartStorage {
  const map = new Map<string, string>(seed ? Object.entries(seed) : [])
  return {
    get: (key) => map.get(key) ?? null,
    set: (key, value) => void map.set(key, value),
    remove: (key) => void map.delete(key),
    keys: () => [...map.keys()],
  }
}
