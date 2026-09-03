// @vitest-environment happy-dom
// The workspace host of the conformance suite: every check in test/conformance/index.ts, run against
// `createChart` from the package source under happy-dom, with the browser shim standing in for the
// canvas the renderer needs. The same module runs in the clean-room consumer over the packed tarball
// and in the app's browser suite over the app's own composition; this host is the one that runs on
// every `pnpm test`.
//
// The host declares what it cannot mount and what it can stand in for. The drawing plane is off here
// until W4-B lands its fix in packages/chart/src/widget/create.ts: mounting a widget with drawings on
// throws "Cannot access 'layout' before initialization", so the checks that need drawings report
// skipped with that reason rather than passing on nothing. Delete `unavailable` when it lands. Two
// checks document known defects in the widget and are skipped by the runner until the fixes land;
// their sentences are in the module beside them.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createChart } from '../../src/index'
import { installBrowserShim, type BrowserShimHandle } from '../../scripts/browserShim'
import { CONFORMANCE_CHECKS, formatResults, runConformance, skipReason, type ConformanceHost, type ConformanceResult } from './index'

let shim: BrowserShimHandle
/** Every result, from one run of the whole suite the way the other two hosts run it. */
let results: ConformanceResult[] = []

beforeAll(async () => {
  shim = installBrowserShim(window)
  results = await runConformance(host)
}, 120_000)
afterAll(() => {
  shim.uninstall()
})

/** A Fullscreen API on one element: the document reports it, and `fullscreenchange` fires on every
 *  transition, the way a browser does once a user gesture has granted it. */
function fakeFullscreen(root: HTMLElement): { dispose(): void } {
  const doc = document as Document & { fullscreenElement: Element | null; fullscreenEnabled: boolean }
  let current: Element | null = null
  Object.defineProperty(doc, 'fullscreenElement', { configurable: true, get: () => current })
  Object.defineProperty(doc, 'fullscreenEnabled', { configurable: true, get: () => true })
  const target = root as HTMLElement & { requestFullscreen: () => Promise<void> }
  target.requestFullscreen = async () => {
    current = root
    doc.dispatchEvent(new Event('fullscreenchange'))
  }
  const exit = doc.exitFullscreen
  doc.exitFullscreen = async () => {
    current = null
    doc.dispatchEvent(new Event('fullscreenchange'))
  }
  return {
    dispose() {
      delete (doc as { fullscreenElement?: unknown }).fullscreenElement
      delete (doc as { fullscreenEnabled?: unknown }).fullscreenEnabled
      doc.exitFullscreen = exit
    },
  }
}

/** A clipboard that takes an image: `ClipboardItem` exists and `navigator.clipboard.write` resolves. */
function fakeClipboard(): { dispose(): void } {
  const g = globalThis as { ClipboardItem?: unknown }
  const hadItem = g.ClipboardItem
  g.ClipboardItem = class {
    constructor(readonly items: Record<string, Blob>) {}
  }
  const nav = navigator as Navigator & { clipboard?: { write?: (items: unknown[]) => Promise<void> } }
  const hadClipboard = nav.clipboard
  Object.defineProperty(nav, 'clipboard', { configurable: true, value: { write: async () => undefined, writeText: async () => undefined } })
  return {
    dispose() {
      if (hadItem === undefined) delete g.ClipboardItem
      else g.ClipboardItem = hadItem
      if (hadClipboard === undefined) delete (nav as { clipboard?: unknown }).clipboard
      else Object.defineProperty(nav, 'clipboard', { configurable: true, value: hadClipboard })
    },
  }
}

const host: ConformanceHost = {
  createWidget: (options) => createChart(options),
  document,
  unavailable: {
    features: { drawings: false },
    reason: "W4-B: createChart with drawings on throws Cannot access 'layout' before initialization (packages/chart/src/widget/create.ts)",
  },
  fullscreen: fakeFullscreen,
  clipboard: fakeClipboard,
}

describe('the conformance suite over the workspace source', () => {
  for (const check of CONFORMANCE_CHECKS) {
    const reason = skipReason(check, host)
    const block = reason ? it.skip : it
    block(`${reason ? '[skipped: ' + reason + '] ' : ''}${check.id}: ${check.title}`, () => {
      const result = results.find((r) => r.id === check.id)
      expect(result, check.id).toBeDefined()
      expect(result!.detail ?? '', result!.id).toBe('')
      expect(result!.status).toBe('passed')
    })
  }

  it('reports every check once, in order, with its status and any reason', () => {
    expect(results.map((r) => r.id)).toEqual(CONFORMANCE_CHECKS.map((c) => c.id))
    const report = formatResults(results)
    for (const check of CONFORMANCE_CHECKS) expect(report).toContain(`${check.id}: ${check.title}`)
    for (const r of results.filter((r) => r.status === 'skipped')) expect(report).toContain(`skip ${r.id}`)
    expect(results.filter((r) => r.status === 'skipped').map((r) => r.id)).toEqual(CONFORMANCE_CHECKS.filter((c) => skipReason(c, host)).map((c) => c.id))
  })

  it('covers every contract the plan names', () => {
    const ids = CONFORMANCE_CHECKS.map((c) => c.id)
    for (const prefix of ['api', 'features', 'access', 'commands', 'lifecycle', 'theme', 'strings', 'a11y', 'image', 'fullscreen', 'persistence', 'feed', 'replay', 'scale', 'sessions', 'compare', 'indicators', 'layouts', 'styles', 'drawings']) {
      expect(ids.some((id) => id.startsWith(`${prefix}.`)), prefix).toBe(true)
    }
    expect(new Set(ids).size).toBe(ids.length)
  })
})
