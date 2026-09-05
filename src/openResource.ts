// The OPEN RESOURCE: what a chart (a saved chart) and a layout (a saved layout) hold while a
// named resource is on screen — its ref and its name — and the three verbs that move it. One
// module because the rule is the same for both families: a save is an UPDATE at the revision the
// resource was opened at, or a CREATE when nothing is open (or the host asked for a copy); a
// refusal comes back as a typed outcome carrying the catalog's copy for the case; nothing here
// ever resolves a conflict by writing over the newer revision.
import type { ChartTranslate } from './i18n'
import { ResourceAbortError, type ResourceRef, type ResourceStore } from './resources'

/** The named resource on screen: the ref it was opened or last saved at, and its name. */
export interface OpenResource {
  ref: ResourceRef
  name: string
}

/** What a save did. `ok` carries the ref the store now holds and, where the store returned one,
 *  the listing row; `conflict` means the resource moved on since it was opened and carries the ref
 *  that stands now; `not-found` means it was deleted elsewhere. Both refusals carry the catalog's
 *  copy so a host shows one sentence and offers its reload. */
export type ResourceSaveOutcome<Meta> =
  | { kind: 'ok'; ref: ResourceRef; meta?: Meta }
  | { kind: 'conflict'; current: ResourceRef; message: string }
  | { kind: 'not-found'; message: string }

export type ResourceLoadOutcome<Body> = { kind: 'ok'; ref: ResourceRef; body: Body } | { kind: 'not-found'; message: string }

export type ResourceRemoveOutcome = { kind: 'ok' } | { kind: 'conflict'; current: ResourceRef; message: string } | { kind: 'not-found'; message: string }

export interface OpenResourceController<Meta, Body extends { name: string }> {
  current(): OpenResource | null
  /** Forget the open resource without touching the store: the on-screen state stays, its saved
   *  binding detaches, and the next save creates. */
  detach(): void
  save(body: Body, opts?: { asNew?: boolean; signal?: AbortSignal }): Promise<ResourceSaveOutcome<Meta>>
  /** Open a resource by id. A later load supersedes one still in flight: the earlier request's
   *  signal aborts, its call rejects with the contract's `AbortError`, and a response that still
   *  arrives is dropped, so the open resource is always the one asked for last. */
  load(id: string, signal?: AbortSignal): Promise<ResourceLoadOutcome<Body>>
  /** Delete the open resource at the revision it is held at. */
  remove(signal?: AbortSignal): Promise<ResourceRemoveOutcome>
}

/** `store` is read per call so a controller built before its adapter exists still works once one
 *  does; null rejects every verb with a plain error, because a host that wired no adapter asked
 *  for something that cannot happen rather than something that failed. */
export function openResourceController<Meta, Body extends { name: string }>(deps: {
  store: () => ResourceStore<Meta, Body> | null
  t: () => ChartTranslate
}): OpenResourceController<Meta, Body> {
  let open: OpenResource | null = null
  /** The load in flight, if any. A newer load takes its place and aborts it, so two loads can
   *  never race to be the open resource. */
  let inFlight: AbortController | null = null
  const storeOrThrow = (): ResourceStore<Meta, Body> => {
    const store = deps.store()
    if (!store) throw new Error('no save/load adapter: pass ChartWidgetOptions.saveLoad to save named resources')
    return store
  }
  return {
    current: () => open,
    detach() {
      open = null
    },
    async save(body, opts) {
      const store = storeOrThrow()
      const at = opts?.asNew ? null : open
      const outcome = at ? await store.update(at.ref, body, opts?.signal) : await store.create(body, opts?.signal)
      if (outcome.kind === 'ok') {
        open = { ref: outcome.ref, name: body.name }
        return outcome.value === undefined ? { kind: 'ok', ref: outcome.ref } : { kind: 'ok', ref: outcome.ref, meta: outcome.value }
      }
      if (outcome.kind === 'conflict') return { kind: 'conflict', current: outcome.current, message: deps.t()('host.saveConflict') }
      return { kind: 'not-found', message: deps.t()('host.saveNotFound') }
    },
    async load(id, signal) {
      const store = storeOrThrow()
      inFlight?.abort()
      const mine = new AbortController()
      inFlight = mine
      // The caller's signal rides along: aborting it aborts this load the same way a newer load does.
      const forward = (): void => mine.abort()
      if (signal?.aborted) forward()
      else signal?.addEventListener('abort', forward, { once: true })
      try {
        const found = await store.load(id, mine.signal)
        // A store may answer after the abort it was handed; that answer is nobody's open resource.
        if (mine.signal.aborted) throw new ResourceAbortError(inFlight === mine ? undefined : 'the load was superseded by a later load')
        if (!found) return { kind: 'not-found', message: deps.t()('host.saveNotFound') }
        open = { ref: found.ref, name: found.body.name }
        return { kind: 'ok', ref: found.ref, body: found.body }
      } finally {
        signal?.removeEventListener('abort', forward)
        if (inFlight === mine) inFlight = null
      }
    },
    async remove(signal) {
      const store = storeOrThrow()
      if (!open) return { kind: 'not-found', message: deps.t()('host.saveNotFound') }
      const outcome = await store.remove(open.ref, signal)
      if (outcome.kind === 'ok') {
        open = null
        return { kind: 'ok' }
      }
      if (outcome.kind === 'conflict') return { kind: 'conflict', current: outcome.current, message: deps.t()('host.saveConflict') }
      open = null
      return { kind: 'not-found', message: deps.t()('host.saveNotFound') }
    },
  }
}
