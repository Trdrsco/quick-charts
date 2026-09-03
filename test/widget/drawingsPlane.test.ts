// @vitest-environment happy-dom
// The drawing plane composed the way the chart composes it: the layer over a fake renderer, the
// toolbar, favorites bar and settings bar in a chrome box, the standing preferences behind them,
// and every verb reached through the real command registry with the chart's own registrations.
// What is pinned is the wiring: a toolbar press changes the preference the chart persists, the
// eye blanks drawings and studies, a refused command is refused from the glass, and the keyboard
// goes through the same door.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChartI18n } from '../../src/i18n'
import { DEFAULT_DRAWING_PREFERENCES, type DrawingPreferences } from '../../src/drawings/index'
import { createCommandRegistry } from '../../src/widget/commands'
import { registerChartCommands } from '../../src/widget/chartCommands'
import { attachDrawingsPlane } from '../../src/widget/drawings'
import { openOverlays } from '../../src/ui/drawings/overlays'
import { resolveFeatures } from '../../src/widget/planes'
import type { ChartHandle } from '../../src/widget/chart'
import { memorySaveLoadAdapter } from '../../src/resources'
import { click, drag, fakeChart } from '../drawings/fakeChart'

interface Rig {
  chrome: HTMLElement
  gestures: HTMLElement
  prefs: () => DrawingPreferences
  plane: ReturnType<typeof attachDrawingsPlane>
  run: (id: string, arg?: unknown) => string
  indicatorsHidden: () => boolean
  events: { kind: string; id: string | null }[]
  dispose: () => void
}

function rig(options: { deny?: (id: string) => boolean; refuseTool?: string; charts?: number } = {}): Rig {
  const fake = fakeChart()
  const root = document.createElement('div')
  const gestures = document.createElement('div')
  const chrome = document.createElement('div')
  root.append(gestures, chrome)
  document.body.appendChild(root)
  const i18n = createChartI18n()
  let prefs: DrawingPreferences = DEFAULT_DRAWING_PREFERENCES
  let indicatorsHidden = false
  const events: Rig['events'] = []
  const registry = createCommandRegistry(options.deny ? { access: { command: (id) => !options.deny!(id) } } : undefined)
  const adapter = memorySaveLoadAdapter()
  const plane = attachDrawingsPlane({
    chart: fake.chart,
    series: fake.series,
    container: gestures,
    chrome,
    chartId: 'chart-1',
    symbol: 'ES',
    timeframe: '5m',
    bars: () => [],
    resources: adapter,
    i18n,
    enabled: true,
    toolbar: true,
    favorites: true,
    ...(options.refuseTool ? { access: { drawingTool: (tool: string) => tool !== options.refuseTool } } : {}),
    commands: registry.registry,
    preferences: () => prefs,
    setPreferences: (next) => {
      prefs = next
      plane.refresh()
    },
    indicators: { count: () => 2, setAllHidden: (hidden) => (indicatorsHidden = hidden) },
    chartCount: () => options.charts ?? 1,
    onSaveConflict: () => undefined,
    onChange: (kind, id) => events.push({ kind, id }),
  })
  // The chart's own registrations over a handle that carries this plane; only the drawing block
  // is exercised, so the rest of the handle is the minimum the registration touches.
  const handle = { drawings: plane.api, indicators: { get: () => [], set: () => undefined, remove: () => undefined, hide: () => undefined, show: () => undefined, hidden: () => [] } } as unknown as ChartHandle
  const unregister = registerChartCommands({
    commands: registry.registry,
    handle,
    features: resolveFeatures(),
    capabilities: () => ({}) as never,
    t: () => i18n.t,
    earliestBar: () => null,
    frame: () => undefined,
    zoom: () => undefined,
    scroll: () => undefined,
    level: () => null,
    formatter: () => ({}) as never,
    compareOpen: () => undefined,
    drawingVerbs: () => plane.verbs,
  })
  return {
    chrome,
    gestures,
    prefs: () => prefs,
    plane,
    run: (id, arg) => registry.registry.execute(id, arg).kind,
    indicatorsHidden: () => indicatorsHidden,
    events,
    dispose: () => {
      unregister()
      plane.destroy()
      registry.dispose()
      root.remove()
    },
  }
}

const byLabel = (chrome: HTMLElement, label: string): HTMLButtonElement => [...chrome.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.getAttribute('aria-label') === label)!

let rigs: Rig[] = []
const make = (options?: Parameters<typeof rig>[0]): Rig => {
  const r = rig(options)
  rigs.push(r)
  return r
}
afterEach(() => {
  for (const r of rigs) r.dispose()
  rigs = []
  document.body.replaceChildren()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('the plane through the registry', () => {
  it('mounts the toolbar, the favorites bar and the settings bar in the chrome box', () => {
    const { chrome } = make()
    expect(chrome.querySelector('[data-role="drawing-toolbar"]')).toBeTruthy()
    expect(chrome.querySelector('[data-role="drawing-favorites"]')).toBeTruthy()
    expect(chrome.querySelector<HTMLElement>('[data-role="drawing-settings-bar"]')!.hidden).toBe(true)
  })

  it('a toolbar press becomes a preference the chart persists, and the layer reads it live', () => {
    const { chrome, prefs, plane, gestures } = make()
    byLabel(chrome, 'Magnet').click()
    expect(prefs().magnet).toBe('weak')
    expect(prefs().magnetStrength).toBe('weak')
    byLabel(chrome, 'Stay in drawing mode').click()
    expect(prefs().stayInDrawingMode).toBe(true)
    byLabel(chrome, 'Trend line').click()
    expect(plane.api!.activeTool()).toBe('trend_line')
    expect(prefs().railTools).toEqual({ trend: 'trend_line' })
    drag(gestures, [100, 100], [300, 200])
    expect(plane.api!.activeTool()).toBe('trend_line') // stay in mode held it
    expect(chrome.querySelector<HTMLElement>('[data-role="drawing-settings-bar"]')!.hidden).toBe(false)
  })

  it('the eye blanks drawings, then studies, then both, and the settings bar follows the selection', () => {
    const { chrome, plane, indicatorsHidden, gestures, run } = make()
    run('chart.drawings.arm', 'rectangle')
    drag(gestures, [10, 10], [100, 100])
    expect(plane.api!.hasSelection()).toBe(true)
    byLabel(chrome, 'Hide drawings').click()
    expect(plane.api!.allHidden()).toBe(true)
    expect(indicatorsHidden()).toBe(false)
    expect(plane.api!.hasSelection()).toBe(false)
    expect(run('chart.drawings.hide', { mode: 'indicators', on: true })).toBe('ok')
    expect(plane.api!.allHidden()).toBe(false)
    expect(indicatorsHidden()).toBe(true)
    expect(run('chart.drawings.hide', { mode: 'all', on: true })).toBe('ok')
    expect(plane.api!.allHidden()).toBe(true)
    expect(indicatorsHidden()).toBe(true)
    expect(byLabel(chrome, 'Show all')).toBeTruthy()
  })

  it('a denied command is refused from the toolbar and from the keyboard alike, and its control renders disabled', () => {
    const { chrome, plane, gestures, run } = make({ deny: (id) => id === 'chart.drawings.deleteSelected' || id === 'chart.drawings.magnet' })
    expect(byLabel(chrome, 'Magnet').disabled).toBe(true)
    expect(byLabel(chrome, 'Magnet menu').disabled).toBe(true)
    expect(byLabel(chrome, 'Lock all drawings').disabled).toBe(false)
    byLabel(chrome, 'Magnet').click()
    expect(plane.api!.activeTool()).toBeNull()
    expect(run('chart.drawings.magnet', 'weak')).toBe('denied')
    run('chart.drawings.arm', 'rectangle')
    drag(gestures, [10, 10], [100, 100])
    expect(plane.api!.count()).toBe(1)
    // The settings bar rendered for the selection: the delete control is there and disabled.
    expect(byLabel(chrome, 'Delete drawing').disabled).toBe(true)
    expect(byLabel(chrome, 'Lock drawing').disabled).toBe(false)
    gestures.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    expect(plane.api!.count()).toBe(1)
    expect(run('chart.drawings.deleteSelected')).toBe('denied')
    gestures.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(plane.api!.count()).toBe(1)
  })

  it('a selection verb renders enabled only while the registry would run it', () => {
    const { chrome, gestures, run } = make()
    expect(byLabel(chrome, 'Remove drawings').disabled).toBe(true)
    run('chart.drawings.arm', 'rectangle')
    drag(gestures, [10, 10], [100, 100])
    expect(byLabel(chrome, 'Remove drawings').disabled).toBe(false)
    byLabel(chrome, 'More drawing actions').click()
    const rows = [...chrome.querySelectorAll<HTMLButtonElement>('[data-role="drawing-popover"] [role="menuitem"]')]
    expect(rows.find((r) => r.textContent?.startsWith('Paste'))!.disabled).toBe(true)
    run('chart.drawings.copy')
    byLabel(chrome, 'More drawing actions').click()
    byLabel(chrome, 'More drawing actions').click()
    const again = [...chrome.querySelectorAll<HTMLButtonElement>('[data-role="drawing-popover"] [role="menuitem"]')]
    expect(again.find((r) => r.textContent?.startsWith('Paste'))!.disabled).toBe(false)
  })

  it('a tool the access policy refuses is disabled on the toolbar and refused by the api', () => {
    const { chrome, plane, run } = make({ refuseTool: 'trend_line' })
    expect(byLabel(chrome, 'Trend line').disabled).toBe(true)
    expect(run('chart.drawings.arm', 'trend_line')).toBe('ok') // the command ran; the plane refused the tool
    expect(plane.api!.activeTool()).toBeNull()
    plane.api!.armTool('trend_line')
    expect(plane.api!.activeTool()).toBeNull()
    plane.api!.armTool('ray')
    expect(plane.api!.activeTool()).toBe('ray')
  })

  it('favorites, the bar switch and the remove policy write the record; a glyph pick remembers the glyph', () => {
    const { chrome, prefs, run, plane } = make()
    expect(run('chart.drawings.favorite', 'ray')).toBe('ok')
    expect(prefs().favorites.tools).toEqual(['ray'])
    expect(chrome.querySelectorAll('[data-role="drawing-favorites"] .qc-drawing-favorite')).toHaveLength(1)
    byLabel(chrome, 'Favorite drawing tools toolbar').click()
    expect(prefs().favorites.visible).toBe(false)
    expect(chrome.querySelector<HTMLElement>('[data-role="drawing-favorites"]')!.hidden).toBe(true)
    expect(run('chart.drawings.removeLockedPolicy', true)).toBe('ok')
    expect(prefs().removeLocked).toBe(true)
    expect(run('chart.drawings.arm', { tool: 'emoji', props: { glyph: '🚀' } })).toBe('ok')
    expect(plane.api!.activeTool()).toBe('emoji')
    expect(prefs().recentGlyphs).toEqual(['🚀'])
    expect(run('chart.drawings.cursor', 'dot')).toBe('ok')
    expect(prefs().cursor).toBe('dot')
    expect(plane.api!.activeTool()).toBeNull()
  })

  it('the selection verbs run through the registry and are unavailable without a selection', () => {
    const { plane, gestures, run, chrome } = make()
    expect(run('chart.drawings.style', { lineWidth: 3 })).toBe('unavailable')
    run('chart.drawings.arm', 'rectangle')
    drag(gestures, [10, 10], [100, 100])
    expect(run('chart.drawings.style', { lineWidth: 3 })).toBe('ok')
    expect(plane.api!.selected()?.lineWidth).toBe(3)
    expect(run('chart.drawings.lock', true)).toBe('ok')
    expect(plane.api!.selected()?.locked).toBe(true)
    expect(byLabel(chrome, 'Unlock drawing')).toBeTruthy()
    expect(run('chart.drawings.lock', false)).toBe('ok')
    expect(run('chart.drawings.clone')).toBe('ok')
    expect(plane.api!.count()).toBe(2)
    expect(run('chart.drawings.copy')).toBe('ok')
    expect(run('chart.drawings.paste')).toBe('ok')
    expect(plane.api!.count()).toBe(3)
    expect(run('chart.drawings.sendToBack')).toBe('ok')
    expect(plane.api!.stackPosition().atBack).toBe(true)
    expect(run('chart.drawings.visibility', 'current-only')).toBe('ok')
    expect(run('chart.drawings.hideSelected')).toBe('ok')
    expect(plane.api!.hasSelection()).toBe(false)
    expect(run('chart.drawings.removeAll', true)).toBe('ok')
    expect(plane.api!.count()).toBe(0)
  })

  it('opens the settings dialog for the selection, and commits it through the registry', () => {
    const { chrome, gestures, run, plane } = make()
    run('chart.drawings.arm', 'rectangle')
    drag(gestures, [10, 10], [100, 100])
    byLabel(chrome, 'Drawing settings').click()
    const dialog = chrome.querySelector<HTMLElement>('[data-role="drawing-settings"]')!
    expect(dialog.getAttribute('aria-label')).toBe('Rectangle settings')
    dialog.querySelector<HTMLButtonElement>('button[aria-label="Ok"]')!.click()
    expect(chrome.querySelector('[data-role="drawing-settings"]')).toBeNull()
    expect(plane.api!.hasSelection()).toBe(true)
  })

  it('the inline text editor mounts on a text placement and commits into the drawing', () => {
    vi.useFakeTimers()
    const { chrome, gestures, run, plane } = make()
    run('chart.drawings.arm', 'text')
    click(gestures, 100, 100)
    vi.runAllTimers()
    const area = chrome.querySelector<HTMLTextAreaElement>('textarea')!
    expect(area).toBeTruthy()
    area.value = 'Breakout'
    area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))
    expect(chrome.querySelector('textarea')).toBeNull()
    expect(plane.api!.export()[0]?.props?.text).toBe('Breakout')
  })

  it('shows the sync switch in a layout and binds a new drawing to this chart when sync is off', () => {
    const { chrome, prefs, run, gestures, plane } = make({ charts: 2 })
    byLabel(chrome, 'Sync drawings across the layout').click()
    expect(prefs().syncAcrossPanes).toBe(false)
    run('chart.drawings.arm', 'rectangle')
    drag(gestures, [10, 10], [100, 100])
    expect(plane.api!.export()[0]?.scope).toBe('chart-1')
  })

  it('reports tool and selection changes to the chart, and takes everything down on destroy', () => {
    const r = make()
    r.run('chart.drawings.arm', 'rectangle')
    drag(r.gestures, [10, 10], [100, 100])
    expect(r.events.map((e) => e.kind)).toEqual(['tool', 'tool', 'selection'])
    r.dispose()
    rigs = []
    expect(document.querySelector('[data-role="drawing-toolbar"]')).toBeNull()
  })

  it('closes every open overlay on destroy and leaves no document or window listener behind', () => {
    // Every listener the plane and its surfaces put on the document or the window, by target,
    // type and function; a removal takes its addition off, so what is left after destroy is a leak.
    const live: { target: string; type: string; fn: unknown }[] = []
    for (const [name, target] of [['document', document], ['window', window]] as const) {
      const add = target.addEventListener.bind(target)
      const remove = target.removeEventListener.bind(target)
      vi.spyOn(target, 'addEventListener').mockImplementation((type: string, fn: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
        live.push({ target: name, type, fn })
        add(type, fn, options)
      })
      vi.spyOn(target, 'removeEventListener').mockImplementation((type: string, fn: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => {
        const at = live.findIndex((x) => x.target === name && x.type === type && x.fn === fn)
        if (at >= 0) live.splice(at, 1)
        remove(type, fn, options)
      })
    }
    const r = make()
    const { chrome, gestures } = r
    r.run('chart.drawings.arm', 'rectangle')
    drag(gestures, [10, 10], [100, 100])
    // A settings dialog with its template menu open over it, and the bar's color palette.
    byLabel(chrome, 'Drawing settings').click()
    const dialog = chrome.querySelector<HTMLElement>('[data-role="drawing-settings"]')!
    dialog.querySelector<HTMLButtonElement>('button[aria-label="Template"]')!.click()
    expect(dialog.querySelector('[data-role="drawing-popover"]')).toBeTruthy()
    expect(openOverlays(chrome)).toBe(1)
    expect(openOverlays(dialog)).toBe(1)
    expect(live.length).toBeGreaterThan(0)
    r.dispose()
    rigs = []
    expect(openOverlays(chrome)).toBe(0)
    expect(openOverlays(dialog)).toBe(0)
    expect(document.querySelector('[data-role="drawing-settings"]')).toBeNull()
    expect(document.querySelector('[data-role="drawing-popover"]')).toBeNull()
    expect(live.map((x) => `${x.target}:${x.type}`)).toEqual([])
  })

  it('opens the toolbar flyout and the bar palette inside the chart root, absolutely placed, and closes them with the plane', () => {
    const r = make()
    const { chrome, gestures } = r
    byLabel(chrome, 'Trend tools menu').click()
    const flyout = chrome.querySelector<HTMLElement>('[data-role="drawing-popover"]')!
    // Positioned by the package stylesheet's .qc-drawing-popover rule (absolute, inside the root).
    expect(flyout.classList.contains('qc-drawing-popover')).toBe(true)
    expect(flyout.parentElement).toBe(chrome)
    expect(openOverlays(chrome)).toBe(1)
    r.run('chart.drawings.arm', 'rectangle')
    drag(gestures, [10, 10], [100, 100])
    byLabel(chrome, 'Drawing color').click()
    expect(chrome.querySelectorAll('[data-role="drawing-popover"]')).toHaveLength(1)
    expect(openOverlays(chrome)).toBe(1)
    r.dispose()
    rigs = []
    expect(openOverlays(chrome)).toBe(0)
    expect(document.querySelector('[data-role="drawing-popover"]')).toBeNull()
  })
})
