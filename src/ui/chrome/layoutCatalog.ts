// The saved layouts as the chrome knows them: one listing of the host's layout store, shared by every
// surface that shows it. The catalog lists the store as the chrome mounts, so the saved-layouts
// menu's recent rows and the Layouts dialog open on rows already in hand, and each open asks the
// store again and swaps in its answer when it lands. A save that adds a layout or renames one, and
// every delete, list the store again; a deleted layout leaves the rows at once. A save of a layout
// already listed under the same name, which is what every autosave is, moves its row to the front as
// the most recently used and asks nothing: the next open lists the rest. The listing that lands is the
// latest one asked for: an answer to an earlier request never replaces a later one.
import type { LayoutBody, LayoutMeta, ResourceStore } from '../../resources'
import type { ChartWidget } from '../../widget/create'

export interface LayoutCatalog {
  /** The layouts as the store last listed them, or null before its first answer. */
  rows(): readonly LayoutMeta[] | null
  /** Whether the store refused a listing while the catalog holds none. */
  failed(): boolean
  /** List the store again. A listing already on its way answers for this one too. Rejects when the
   *  store refuses; the rows already listed stand. */
  refresh(): Promise<void>
  /** Hear the rows or the failure change. Returns the unsubscribe. */
  onChange(cb: () => void): () => void
  destroy(): void
}

export function createLayoutCatalog(deps: { store: ResourceStore<LayoutMeta, LayoutBody>; widget: Pick<ChartWidget, 'on'> }): LayoutCatalog {
  let rows: readonly LayoutMeta[] | null = null
  let failed = false
  let destroyed = false
  /** Requests are numbered, and only an answer newer than the rows it would replace lands. */
  let asked = 0
  let landed = 0
  let pending: Promise<void> | null = null
  const listeners = new Set<() => void>()
  const emit = (): void => {
    for (const cb of [...listeners]) cb()
  }

  const refresh = (): Promise<void> => {
    if (pending) return pending
    const request = ++asked
    const listing = deps.store
      .list()
      .then(
        (found) => {
          if (destroyed || request <= landed) return
          landed = request
          rows = found
          failed = false
          emit()
        },
        (error: unknown) => {
          if (!destroyed && request > landed && rows === null && !failed) {
            failed = true
            emit()
          }
          throw error
        },
      )
      .finally(() => {
        if (pending === listing) pending = null
      })
    pending = listing
    return listing
  }

  /** The store changed under the rows: a listing already on its way may predate the change, so a new
   *  one is asked for. */
  const relist = (): void => {
    pending = null
    void refresh().catch(() => undefined)
  }

  const offLayout = deps.widget.on('layout', (event) => {
    if (event.kind === 'removed' && rows && event.id !== null) {
      rows = rows.filter((row) => row.id !== event.id)
      emit()
    }
    if (event.kind === 'saved' && rows && event.id !== null) {
      const row = rows.find((one) => one.id === event.id)
      if (row && row.name === event.name) {
        rows = [{ ...row, updatedAt: Date.now() }, ...rows.filter((one) => one !== row)]
        emit()
        return
      }
    }
    if (event.kind === 'saved' || event.kind === 'removed') relist()
  })
  void refresh().catch(() => undefined)

  return {
    rows: () => rows,
    failed: () => failed,
    refresh,
    onChange(cb) {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    destroy() {
      destroyed = true
      listeners.clear()
      offLayout()
    },
  }
}
