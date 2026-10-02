// The OPEN RESOURCE: what a chart (a saved chart) and a layout (a saved layout) hold while a
// named resource is on screen — its ref and its name — and the three verbs that move it. One
// module because the rule is the same for both families: a save is an UPDATE at the revision the
// resource was opened at, or a CREATE when nothing is open (or the host asked for a copy); a
// refusal comes back as a typed outcome carrying the catalog's copy for the case; nothing here
// ever resolves a conflict by writing over the newer revision.
//
// Every way a load can end is a `kind` on one union, so a caller decides on the shape of the answer
// rather than on the text of a message: the body was refused, the id is unknown, the store could
// not be reached, or the load was abandoned. The one thing that is not an outcome is a missing
// adapter, which is a host that wired nothing rather than a verb that failed.
import type { ChartTranslate } from './i18n'
import type { ResourceRef, ResourceStore } from './resources'

/** The abort contract, read off any rejection: the chart's own `ResourceAbortError` and the
 *  `DOMException` a fetch-backed store rejects with are both named 'AbortError', and the contract
 *  says a host may use either. */
const isAbort = (error: unknown): boolean => typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError'

/** The named resource on screen: the ref it was opened or last saved at, and its name. */
export interface OpenResource {
  ref: ResourceRef
  name: string
}

/** What a save did. `ok` carries the ref the store now holds and, where the store returned one,
 *  the listing row; `conflict` means the resource moved on since it was opened and carries the ref
 *  that stands now; `not-found` means it was deleted elsewhere; `not-saving` means the chart holds
 *  content it could not put back, so it writes nowhere until a load puts a whole content back under
 *  the resource it came from. Every refusal carries the catalog's copy so a host shows one
 *  sentence. */
export type ResourceSaveOutcome<Meta> =
  | { kind: 'ok'; ref: ResourceRef; meta?: Meta }
  | { kind: 'conflict'; current: ResourceRef; message: string }
  | { kind: 'not-found'; message: string }
  | { kind: 'not-saving'; message: string }

/** A refused body the destination could not undo: the apply failed part-way AND putting back the
 *  content it held failed too, so what is on screen is neither the body it refused nor what it had.
 *  `refusal` is the error that refused the body, `rollback` the one that refused to undo it. The
 *  load still binds nothing; this is what puts the destination into `notSaving`, so a screen that
 *  is neither content is never written over the resource it is still bound to. */
export class ResourceRollbackError extends Error {
  constructor(
    readonly refusal: unknown,
    readonly rollback: unknown,
  ) {
    super('the content could not be applied, and the content that was held could not be put back')
    this.name = 'ResourceRollbackError'
  }
}

/** What a load did, as five answers a caller tells apart by `kind` alone.
 *
 *  - `ok` carries the ref the resource was read at and its body. It is the only kind that binds.
 *  - `not-found` means the store answered, and the id is unknown to it.
 *  - `invalid` means the destination refused the content it was handed, which is what a body this
 *    build cannot read comes back as.
 *  - `unavailable` means the store could not be reached at all. The content may be perfectly good,
 *    so this is not a judgement on it; `cause` is what the store failed with, for a host's log.
 *  - `cancelled` means the load was abandoned before it could land: a later load superseded it, the
 *    caller's signal aborted, or the chart it was for went down. It carries nothing to show.
 *
 *  Every refusal carries the catalog's copy, and none of them changes which resource the next save
 *  writes to. A refusal leaves what is on screen alone, except where the destination applied part
 *  of a body and could not put back what it held; the `invalid` message says so, and the
 *  destination stops saving until a later load puts a whole content back. */
export type ResourceLoadOutcome<Body> =
  | { kind: 'ok'; ref: ResourceRef; body: Body }
  | { kind: 'not-found'; message: string }
  | { kind: 'invalid'; message: string }
  | { kind: 'unavailable'; message: string; cause: unknown }
  | { kind: 'cancelled' }

export type ResourceRemoveOutcome = { kind: 'ok' } | { kind: 'conflict'; current: ResourceRef; message: string } | { kind: 'not-found'; message: string }

export interface OpenResourceController<Meta, Body extends { name: string }> {
  current(): OpenResource | null
  /** Private command readiness: a pending load owns the next resource selection. */
  loading(): boolean
  /** True while the destination holds content it could not put back. Nothing is written over the
   *  resource it is bound to until a load lands. */
  notSaving(): boolean
  /** Report that the destination holds neither the content it was handed nor the content it had.
   *  Called for a rollback the destination could not complete, from a load and from a host's own
   *  apply alike, because the danger is the state, not the door it came through. */
  stopSaving(): void
  /** Internal containing-resource commit: a whole child now belongs to its loaded layout. */
  recoverInParent(): void
  /** Forget the open resource without touching the store: the on-screen state stays, its saved
   *  binding detaches, and the next save creates. */
  detach(): void
  /** Save `body`: an update of the open resource at its held revision, or a create for a copy and
   *  for a destination holding nothing open. While `notSaving`, only `asNew` is allowed through,
   *  because a create writes over nothing and puts what is on screen somewhere the viewer can get
   *  at it; it does not end the state, because writing a screen down is no evidence that the screen
   *  is whole. Anything else answers `not-saving` and touches the store not at all. */
  save(body: Body, opts?: { asNew?: boolean; signal?: AbortSignal }): Promise<ResourceSaveOutcome<Meta>>
  /** Open a resource by id. A later load supersedes one still in flight: the earlier request's
   *  signal aborts, its call answers `cancelled`, and a response that still arrives is dropped, so
   *  the open resource is always the one asked for last.
   *
   *  `apply` is the destination's half of the transaction: it stages, validates and applies the
   *  loaded body, and the resource's identity, name and revision are adopted only after it
   *  returns. Throwing refuses the load as `invalid`; throwing the contract's abort error cancels
   *  it. Either way the open resource stays the one it was, so a refused load can never leave the
   *  next save writing what is on screen over the resource it failed to open. */
  load(id: string, signal?: AbortSignal, apply?: (body: Body) => void): Promise<ResourceLoadOutcome<Body>>
  /** Delete the open resource, or a privately supplied browser row, at its quoted revision. */
  remove(signal?: AbortSignal, ref?: ResourceRef): Promise<ResourceRemoveOutcome>
}

/** `store` is read per call so a controller built before its adapter exists still works once one
 *  does; null rejects every verb with a plain error, because a host that wired no adapter asked
 *  for something that cannot happen rather than something that failed. */
export function openResourceController<Meta, Body extends { name: string }>(deps: {
  store: () => ResourceStore<Meta, Body> | null
  t: () => ChartTranslate
  blocked?: () => boolean
  disposed?: () => boolean
  /** False means the accepted body was partial, not proof of recovery from a failed rollback. */
  committed?: () => boolean | void
  /** Private publication at the binding commit, never reconstructed by an awaiting command. */
  changed?: (kind: 'saved' | 'loaded' | 'removed' | 'detached', resource: OpenResource | null) => void
}): OpenResourceController<Meta, Body> {
  let open: OpenResource | null = null
  /** Set when the destination could not put back the content it held, and cleared by the one thing
   *  that proves it holds a whole content again under the resource that content came from: a load
   *  that lands. A store that takes a write proves neither half of that, so no save clears it. */
  let stopped = false
  // Storage calls may outlive the binding they started from. Their outcomes still describe the
  // store, but only the current operation may change which resource this destination holds.
  let generation = 0
  const isCurrent = (mine: number): boolean => mine === generation && deps.disposed?.() !== true
  const notSaving = (): boolean => stopped || deps.blocked?.() === true
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
    loading: () => inFlight !== null,
    notSaving,
    stopSaving() {
      stopped = true
    },
    recoverInParent() {
      generation++
      inFlight?.abort()
      open = null
      stopped = false
    },
    detach() {
      const changed = open !== null || inFlight !== null
      generation++
      inFlight?.abort()
      inFlight = null
      open = null
      if (changed) deps.changed?.('detached', null)
    },
    async save(body, opts) {
      const store = storeOrThrow()
      const asNew = opts?.asNew === true
      // The one write a half-applied screen is allowed: it creates, so the resource this destination
      // is bound to is left standing whole and the viewer keeps what is on screen. It is a rescue,
      // not a recovery: the row it writes holds that same unproven screen.
      if (notSaving() && !asNew) return { kind: 'not-saving', message: deps.t()('host.notSaving') }
      const mine = ++generation
      const at = asNew ? null : open
      const outcome = at ? await store.update(at.ref, body, opts?.signal) : await store.create(body, opts?.signal)
      if (outcome.kind === 'ok') {
        // A create adopts what it made, a copy included. What a save cannot do is decide the screen
        // is whole, so nothing here clears a destination that stopped saving.
        if (isCurrent(mine)) {
          open = { ref: outcome.ref, name: body.name }
          deps.changed?.('saved', open)
        }
        return outcome.value === undefined ? { kind: 'ok', ref: outcome.ref } : { kind: 'ok', ref: outcome.ref, meta: outcome.value }
      }
      if (outcome.kind === 'conflict') return { kind: 'conflict', current: outcome.current, message: deps.t()('host.saveConflict') }
      return { kind: 'not-found', message: deps.t()('host.saveNotFound') }
    },
    async load(id, signal, apply) {
      const store = storeOrThrow()
      const operation = ++generation
      inFlight?.abort()
      const mine = new AbortController()
      inFlight = mine
      // The caller's signal rides along: aborting it aborts this load the same way a newer load does.
      const forward = (): void => mine.abort()
      if (signal?.aborted) forward()
      else signal?.addEventListener('abort', forward, { once: true })
      try {
        let found: { ref: ResourceRef; body: Body } | null
        try {
          found = await store.load(id, mine.signal)
        } catch (error) {
          // A store that rejects on its signal answered the abandonment, not a failure.
          if (isAbort(error)) return { kind: 'cancelled' }
          // Anything else is the store not answering. The id may be perfectly good and so may the
          // body behind it, so this is its own kind rather than a judgement on content.
          return { kind: 'unavailable', message: deps.t()('host.loadUnavailable'), cause: error }
        }
        // A store may answer after the abort it was handed; that answer is nobody's open resource.
        if (mine.signal.aborted) return { kind: 'cancelled' }
        if (!found) return { kind: 'not-found', message: deps.t()('host.saveNotFound') }
        const held = open
        if (apply) {
          try {
            apply(found.body)
          } catch (error) {
            // A cancellation is not a refusal of the content: a destination that went down while
            // the store was answering ends the way a superseded load does. Anything else means the
            // destination could not take this body, and the binding it already held stands.
            if (isAbort(error)) return { kind: 'cancelled' }
            // A refusal the destination could not undo is still a refusal, and it still binds
            // nothing, but the screen it left behind is not the one the viewer had: saying
            // "nothing changed" there would be a lie a host would repeat. Nothing writes through
            // the binding until the screen holds a whole content again.
            if (error instanceof ResourceRollbackError) {
              stopped = true
              return { kind: 'invalid', message: deps.t()('host.loadNotRestored') }
            }
            return { kind: 'invalid', message: deps.t()('host.loadInvalid') }
          }
        }
        // Applying a body can synchronously reach a host callback. If that callback detached this
        // resource or began another operation, it owns the later lifetime: this load must not bind
        // after it. Where the former binding still stands, drop only that stale binding. Do not use
        // `detach()` here because it would abort a newer load already in flight, and do not disturb a
        // newer operation that has already committed its own binding.
        if (!isCurrent(operation) || mine.signal.aborted) {
          if (open === held && open !== null) {
            open = null
            if (deps.disposed?.() !== true) deps.changed?.('detached', null)
          }
          return { kind: 'cancelled' }
        }
        // Adopted last, and only once the content is on screen: identity, name and revision move
        // together or not at all. A whole content came out of the store and the destination took all
        // of it, under the resource it came from, so a destination that had stopped saving now holds
        // both halves again and starts. Nothing short of that does.
        open = { ref: found.ref, name: found.body.name }
        generation++
        if (deps.committed?.() !== false) stopped = false
        if (inFlight === mine) inFlight = null
        deps.changed?.('loaded', open)
        return { kind: 'ok', ref: found.ref, body: found.body }
      } finally {
        signal?.removeEventListener('abort', forward)
        if (inFlight === mine) inFlight = null
      }
    },
    async remove(signal, ref) {
      const store = storeOrThrow()
      const at = ref ?? open?.ref
      if (!at) return { kind: 'not-found', message: deps.t()('host.saveNotFound') }
      const held = open
      const targetsOpen = held?.ref.id === at.id
      const mine = targetsOpen ? ++generation : generation
      const outcome = await store.remove(at, signal)
      if (outcome.kind === 'ok') {
        if (isCurrent(mine)) {
          if (targetsOpen) open = null
          deps.changed?.('removed', { ref: at, name: held?.name ?? '' })
        }
        return { kind: 'ok' }
      }
      if (outcome.kind === 'conflict') return { kind: 'conflict', current: outcome.current, message: deps.t()('host.saveConflict') }
      if (targetsOpen && isCurrent(mine)) {
        open = null
        deps.changed?.('removed', { ref: at, name: held!.name })
      }
      return { kind: 'not-found', message: deps.t()('host.saveNotFound') }
    },
  }
}
