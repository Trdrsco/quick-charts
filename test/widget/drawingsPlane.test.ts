// @vitest-environment happy-dom
// The drawing plane composed the way the chart composes it: the layer over a fake renderer, the
// toolbar, favorites bar and settings bar in a chrome box, the standing preferences behind them,
// and every verb reached through the real command registry with the chart's own registrations.
// What is pinned is the wiring: a toolbar press changes the preference the chart persists, the
// eye blanks drawings and studies, a refused command is refused from the glass, and the keyboard
// goes through the same door.
import { CHART_STYLES } from '../../src/widget/styles'
import { ALL_TIMEFRAMES_OFFERED } from '../../src/widget/timeframes'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChartI18n } from '../../src/i18n'
import { DEFAULT_DRAWING_PREFERENCES, type DrawingPreferences } from '../../src/drawings/index'
import type { ChartExtensionHideLayer } from '../../src/extension'
import { createCommandRegistry } from '../../src/widget/commands'
import { registerChartCommands } from '../../src/widget/chartCommands'
import { attachDrawingsPlane } from '../../src/widget/drawings'
import { openOverlays } from '../../src/ui/controls/overlays'
import { resolveFeatures, resolveUi } from '../../src/widget/planes'
import type { ChartHandle } from '../../src/widget/chart'
import { memorySaveLoadAdapter } from '../../src/resources'
import { BUILT_IN_THEMES } from '../../src/theme/palettes'
import type { DrawingAssetPort } from '../../src/drawings/index'
import type { PlacedImage } from '../../src/drawings'
import { click, drag, fakeChart } from '../drawings/fakeChart'
import { ownIcons } from '../ownIcons'

interface Rig {
  chrome: HTMLElement
  gestures: HTMLElement
  prefs: () => DrawingPreferences
  plane: ReturnType<typeof attachDrawingsPlane>
  run: (id: string, arg?: unknown) => string
  indicatorsHidden: () => boolean
  /** The layers extensions offered the eye; a test pushes one and tells the plane. */
  hideLayers: ChartExtensionHideLayer[]
  events: { kind: string; id: string | null }[]
  dispose: () => void
}

function rig(options: { deny?: (id: string) => boolean; refuseTool?: string; charts?: number; assets?: DrawingAssetPort } = {}): Rig {
  const fake = fakeChart()
  const root = document.createElement('div')
  const gestures = document.createElement('div')
  const chrome = document.createElement('div')
  root.append(gestures, chrome)
  document.body.appendChild(root)
  const i18n = createChartI18n()
  let prefs: DrawingPreferences = DEFAULT_DRAWING_PREFERENCES
  let indicatorsHidden = false
  const hideLayers: ChartExtensionHideLayer[] = []
  const events: Rig['events'] = []
  const registry = createCommandRegistry(options.deny ? { access: { command: (id) => !options.deny!(id) } } : undefined)
  const adapter = memorySaveLoadAdapter()
  const plane = attachDrawingsPlane({
    icons: ownIcons(),
    chart: fake.chart,
    series: fake.series,
    container: gestures,
    chrome,
    chartId: 'chart-1',
    chartIdentity: { current: () => 'c1', set: () => undefined },
    documents: null,
    sources: () => ['main'],
    panes: () => ['main'],
    symbol: 'ES',
    timeframe: '5m',
    bars: () => [],
    resources: adapter,
    i18n,
    enabled: true,
    toolbar: true,
    favorites: true,
    ...(options.refuseTool ? { access: { drawingTool: (tool: string) => tool !== options.refuseTool } } : {}),
    ...(options.assets ? { assets: options.assets } : {}),
    commands: registry.registry,
    theme: () => BUILT_IN_THEMES.dark,
    replayPhase: () => 'off' as const,
    preferences: () => prefs,
    setPreferences: (next) => {
      prefs = next
      plane.refresh()
    },
    indicators: { count: () => 2, setAllHidden: (hidden) => (indicatorsHidden = hidden) },
    hideLayers: () => hideLayers,
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
    styles: CHART_STYLES,
    timeframes: ALL_TIMEFRAMES_OFFERED,
    features: resolveFeatures(),
    ui: resolveUi(undefined, resolveFeatures()),
    capabilities: () => ({}) as never,
    bars: () => [],
    resetAppearance: () => undefined,
    t: () => i18n.t,
    earliestBar: () => null,
    replayFromFirst: async () => undefined,
    frame: () => undefined,
    zoom: () => undefined,
    scroll: () => undefined,
    level: () => null,
    formatter: () => ({}) as never,
    compareOpen: () => undefined,
    indicatorsOpen: () => undefined,
    symbolSearchOpen: () => undefined,
    drawingVerbs: () => plane.verbs,
  })
  return {
    chrome,
    gestures,
    prefs: () => prefs,
    plane,
    run: (id, arg) => registry.registry.execute(id, arg).kind,
    indicatorsHidden: () => indicatorsHidden,
    hideLayers,
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
    expect(prefs().drawingToolbarTools).toEqual({ trend: 'trend_line' })
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

  it('a contributed layer joins the eye: listed after its own, blanked by its subject and by all, released when it leaves', () => {
    const { chrome, plane, run, hideLayers } = make()
    const applied: boolean[] = []
    const glyph = { paths: [{ d: 'M4 4 H24 V24 H4 Z' }] }
    hideLayers.push({ id: 'notes', label: { hide: 'Hide notes', show: 'Show notes' }, icon: { shown: glyph, hidden: glyph }, apply: (hidden) => applied.push(hidden) })
    plane.syncHideLayers()
    expect(applied).toEqual([false])
    byLabel(chrome, 'Hide menu').click()
    const rows = [...chrome.querySelectorAll<HTMLElement>('[data-role="drawing-popover"] [role="menuitemradio"]')]
    expect(rows.map((r) => r.textContent)).toEqual(['Hide drawings', 'Hide indicators', 'Hide notes', 'Hide all'])
    rows[2]!.click()
    expect(applied).toEqual([false, true])
    expect(plane.api!.allHidden()).toBe(false)
    expect(byLabel(chrome, 'Show notes').getAttribute('aria-pressed')).toBe('true')
    expect(run('chart.drawings.hide', { mode: 'all', on: true })).toBe('ok')
    expect(applied).toEqual([false, true, true])
    expect(plane.api!.allHidden()).toBe(true)
    // A subject the eye can no longer find is not one it can point at: the eye rests, and what it
    // was blanking is shown again.
    run('chart.drawings.hide', { mode: 'notes', on: true })
    hideLayers.length = 0
    plane.syncHideLayers()
    expect(plane.verbs!.hide()).toEqual({ mode: 'drawings', on: false })
    expect(run('chart.drawings.hide', { mode: 'notes', on: true })).toBe('ok')
    expect(plane.verbs!.hide()).toEqual({ mode: 'drawings', on: false })
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
    const { chrome, gestures, run, plane } = make()
    expect(byLabel(chrome, 'Remove drawings').disabled).toBe(true)
    run('chart.drawings.arm', 'rectangle')
    drag(gestures, [10, 10], [100, 100])
    expect(byLabel(chrome, 'Remove drawings').disabled).toBe(false)
    // Clone needs an EDITABLE selection, so Lock all takes it away and releasing it gives it back;
    // Copy only needs a selection and stays. Lock all drops the selection, so it is named again.
    const id = plane.api!.export()[0]!.id
    const moreRows = (): HTMLButtonElement[] => {
      if (chrome.querySelector('[data-role="drawing-popover"]')) byLabel(chrome, 'More drawing actions').click()
      byLabel(chrome, 'More drawing actions').click()
      return [...chrome.querySelectorAll<HTMLButtonElement>('[data-role="drawing-popover"] [role="menuitem"]')]
    }
    const verb = (rows: HTMLButtonElement[], name: string) => rows.find((r) => r.textContent?.startsWith(name))!
    expect(verb(moreRows(), 'Clone').disabled).toBe(false)
    run('chart.drawings.lockAll', true)
    plane.api!.select(id)
    const locked = moreRows()
    expect(verb(locked, 'Clone').disabled).toBe(true)
    expect(verb(locked, 'Copy').disabled).toBe(false)
    run('chart.drawings.lockAll', false)
    plane.api!.select(id)
    expect(verb(moreRows(), 'Clone').disabled).toBe(false)
  })

  it('a tool the access policy refuses is disabled on the toolbar and refused by the api', () => {
    const { chrome, plane, run } = make({ refuseTool: 'trend_line' })
    expect(byLabel(chrome, 'Trend line').disabled).toBe(true)
    expect(run('chart.drawings.arm', 'trend_line')).toBe('denied') // the door itself refuses the tool
    expect(run('chart.drawings.arm', { tool: 'trend_line', props: {} })).toBe('denied')
    expect(plane.api!.activeTool()).toBeNull()
    expect(run('chart.drawings.arm', 'ray')).toBe('ok')
    expect(plane.api!.activeTool()).toBe('ray')
    plane.api!.armTool(null)
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

  it('places an image only through its command: no asset port or a refused tool answers unavailable', () => {
    const image: PlacedImage = { dataUrl: 'data:image/png;base64,AA', width: 64, height: 48, opacity: 1 }
    const port: DrawingAssetPort = { intakeImage: async () => ({ ok: true, asset: { ...image, downscaled: false } }), glyphSource: () => null }
    const bare = make()
    expect(bare.run('chart.drawings.placeImage', image)).toBe('unavailable')
    expect(bare.run('chart.drawings.arm', 'image')).toBe('ok')
    expect(bare.chrome.querySelector('[data-role="drawing-image-picker"]')).toBeNull()
    const refused = make({ assets: port, refuseTool: 'image' })
    expect(refused.run('chart.drawings.placeImage', image)).toBe('unavailable')
    expect(refused.run('chart.drawings.arm', 'image')).toBe('denied')
    expect(refused.plane.api!.count()).toBe(0)
    const able = make({ assets: port })
    expect(able.run('chart.drawings.arm', 'image')).toBe('ok')
    const picker = able.chrome.querySelector<HTMLElement>('[data-role="drawing-image-picker"]')!
    expect(picker).toBeTruthy()
    expect(picker.querySelector<HTMLButtonElement>('button[aria-label="Ok"]')!.disabled).toBe(true)
    expect(able.run('chart.drawings.placeImage', image)).toBe('ok')
    expect(able.plane.api!.count()).toBe(1)
    expect(able.plane.api!.export()[0]?.type).toBe('image')
  })

  it('places no image through the api while the access policy refuses the image tool', () => {
    const image: PlacedImage = { dataUrl: 'data:image/png;base64,AA', width: 64, height: 48, opacity: 1 }
    const port: DrawingAssetPort = { intakeImage: async () => ({ ok: true, asset: { ...image, downscaled: false } }), glyphSource: () => null }
    const refused = make({ assets: port, refuseTool: 'image' })
    refused.plane.api!.placeImage(image)
    expect(refused.plane.api!.count()).toBe(0)
    const able = make({ assets: port })
    able.plane.api!.placeImage(image)
    expect(able.plane.api!.count()).toBe(1)
  })

  it('carries the snapshot, not the preview, in every document write while the settings dialog is open', () => {
    const { chrome, gestures, run, plane } = make()
    run('chart.drawings.arm', 'trend_line')
    drag(gestures, [10, 10], [100, 100])
    const before = plane.api!.export()[0]!.props!.middlePoint
    byLabel(chrome, 'Drawing settings').click()
    const dialog = chrome.querySelector<HTMLElement>('[data-role="drawing-settings"]')!
    const middle = [...dialog.querySelectorAll<HTMLElement>('.qc-drawing-toggle')].find((x) => x.textContent === 'Middle point')!
    middle.querySelector('input')!.click()
    // The drawing previews the edit; the document still says what it said.
    expect(plane.api!.export()[0]!.props!.middlePoint).toBe(before)
    dialog.querySelector<HTMLButtonElement>('button[aria-label="Ok"]')!.click()
    expect(plane.api!.export()[0]!.props!.middlePoint).toBe(!before)
    // A symbol switch closes an open session with the drawing it previewed.
    byLabel(chrome, 'Drawing settings').click()
    expect(chrome.querySelector('[data-role="drawing-settings"]')).toBeTruthy()
    plane.setSymbol('NQ')
    expect(chrome.querySelector('[data-role="drawing-settings"]')).toBeNull()
  })

  it('announces the eye and lock all through its live region, and the public api carries no session verb', () => {
    const { chrome, run, plane } = make()
    const status = chrome.querySelector<HTMLElement>('[role="status"]')!
    expect(status.getAttribute('aria-live')).toBe('polite')
    run('chart.drawings.hide', { mode: 'drawings', on: true })
    expect(status.textContent).toBe('Drawings hidden')
    run('chart.drawings.hide', { mode: 'all', on: false })
    expect(status.textContent).toBe('Drawings and indicators shown')
    run('chart.drawings.lockAll', true)
    expect(status.textContent).toBe('All drawings locked')
    for (const verb of ['selectedDrawing', 'commitEdit', 'beginPreview', 'endPreview', 'textEdit', 'commitText', 'cancelText', 'presets']) expect(verb in plane.api!, verb).toBe(false)
  })

  it('Delete and Clone are unavailable under lock all, and act on a drawing whose own lock is on', () => {
    const { plane, gestures, run } = make()
    run('chart.drawings.arm', 'rectangle')
    drag(gestures, [10, 10], [100, 100])
    const id = plane.api!.export()[0]!.id
    expect(run('chart.drawings.lockAll', true)).toBe('ok')
    plane.api!.select(id)
    expect(run('chart.drawings.deleteSelected')).toBe('unavailable')
    expect(run('chart.drawings.clone')).toBe('unavailable')
    expect(plane.api!.count()).toBe(1)

    run('chart.drawings.lockAll', false)
    plane.api!.select(id)
    expect(run('chart.drawings.lock', true)).toBe('ok')
    expect(run('chart.drawings.clone')).toBe('ok')
    expect(plane.api!.count()).toBe(2)
    plane.api!.select(id)
    expect(run('chart.drawings.deleteSelected')).toBe('ok')
    expect(plane.api!.count()).toBe(1)
  })

  it('makes Paste unavailable under lock all and never reports ok for a refused paste', () => {
    const { plane, gestures, run } = make()
    run('chart.drawings.arm', 'rectangle')
    drag(gestures, [10, 10], [100, 100])
    expect(run('chart.drawings.copy')).toBe('ok')
    expect(run('chart.drawings.lockAll', true)).toBe('ok')

    expect(run('chart.drawings.paste')).toBe('unavailable')
    expect(plane.api!.count()).toBe(1)

    expect(run('chart.drawings.lockAll', false)).toBe('ok')
    expect(run('chart.drawings.paste')).toBe('ok')
    expect(plane.api!.count()).toBe(2)
  })

  it('keeps Cancel available for a completed Measure readout after Measure disarms', () => {
    const { plane, gestures, run } = make()
    expect(run('chart.drawings.cancel')).toBe('unavailable')
    expect(run('chart.drawings.arm', 'measure')).toBe('ok')
    drag(gestures, [100, 100], [300, 200])
    expect(plane.api!.activeTool()).toBeNull()

    expect(run('chart.drawings.cancel')).toBe('ok')
    gestures.dispatchEvent(new PointerEvent('pointermove', { clientX: 200, clientY: 150, bubbles: true }))
    expect(plane.api!.hovered()).toBeNull()
    expect(run('chart.drawings.cancel')).toBe('unavailable')
  })

  it('locks the pointer as one state: the touch action moves with the pan lock', () => {
    const { gestures, run } = make()
    expect(gestures.style.touchAction).toBe('')
    run('chart.drawings.arm', 'rectangle')
    expect(gestures.style.touchAction).toBe('none')
    gestures.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(gestures.style.touchAction).toBe('')
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
    // The binding token is the chart's PLACE in the layout, not its per-mount instance id: that is
    // the only identity a stored drawing can still be matched against after a reload.
    expect(plane.api!.export()[0]?.scope).toBe('c1')
  })

  it('reports tool, selection and drawing changes to the chart, and takes everything down on destroy', () => {
    const r = make()
    r.run('chart.drawings.arm', 'rectangle')
    drag(r.gestures, [10, 10], [100, 100])
    // Arming the tool, the placement landing, the tool standing down, the new drawing taking the
    // selection, and the layer settling. An edit reports as `changed`, which is what lets a
    // consumer that cares about the drawings themselves tell one from a tool being picked up.
    expect(r.events.map((e) => e.kind)).toEqual(['tool', 'changed', 'tool', 'selection', 'changed', 'changed'])
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

describe('an image pasted over the chart', () => {
  const image: PlacedImage = { dataUrl: 'data:image/png;base64,AA', width: 64, height: 48, opacity: 1 }
  const imageFile = (type = 'image/png'): File => new File(['x'], 'shot.png', { type })
  /** The chart is under the pointer: a paste anywhere else on the page is not this chart's. */
  const hovering = (r: Rig): void => {
    r.gestures.matches = () => true
  }
  const paste = (files: File[]): void => {
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { files } })
    window.dispatchEvent(event)
  }
  const status = (r: Rig): string => r.chrome.querySelector<HTMLElement>('.qc-drawing-status')!.textContent ?? ''
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

  it('places the image the port took', async () => {
    const port: DrawingAssetPort = { intakeImage: async () => ({ ok: true, asset: { ...image, downscaled: false } }), glyphSource: () => null }
    const r = make({ assets: port })
    hovering(r)
    paste([imageFile()])
    await settle()
    expect(r.plane.api!.count()).toBe(1)
    expect(status(r)).toBe('')
  })

  it('says what went wrong for each way the port can refuse, in the words the chart owns', async () => {
    const refusals = [
      ['wrong-type', 'That file is not a JPG or PNG. Pick one of those two formats.'],
      ['too-large', 'The limit is 2MB.'],
      ['unreadable', 'That file could not be read. Try picking it again.'],
      ['undecodable', 'That image could not be opened. It may be damaged.'],
    ] as const
    for (const [error, message] of refusals) {
      const port: DrawingAssetPort = { intakeImage: async () => ({ ok: false, error }), glyphSource: () => null }
      const r = make({ assets: port })
      hovering(r)
      paste([imageFile()])
      await settle()
      expect(status(r), error).toContain(message)
      expect(r.plane.api!.count()).toBe(0)
    }
  })

  it('leaves a text paste and a paste into a field alone', async () => {
    const asked: string[] = []
    const port: DrawingAssetPort = {
      intakeImage: async (file) => (asked.push(file.name), { ok: false, error: 'unreadable' }),
      glyphSource: () => null,
    }
    const r = make({ assets: port })
    hovering(r)
    paste([new File(['x'], 'notes.txt', { type: 'text/plain' })])
    await settle()
    expect(asked).toEqual([])
    expect(status(r)).toBe('')

    const field = document.createElement('input')
    document.body.appendChild(field)
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { files: [imageFile()] } })
    field.dispatchEvent(event)
    await settle()
    expect(asked).toEqual([])
  })

  it('reports on the chart the pointer is over, and nowhere else', async () => {
    const port: DrawingAssetPort = { intakeImage: async () => ({ ok: false, error: 'too-large' }), glyphSource: () => null }
    const a = make({ assets: port })
    const b = make({ assets: port })
    hovering(b)
    paste([imageFile()])
    await settle()
    expect(status(a)).toBe('')
    expect(status(b)).toContain('The limit is 2MB.')
  })

  it('says nothing after the plane is gone', async () => {
    let answer: (result: { ok: false; error: 'unreadable' }) => void = () => undefined
    const port: DrawingAssetPort = {
      intakeImage: () => new Promise((resolve) => (answer = resolve)),
      glyphSource: () => null,
    }
    const r = make({ assets: port })
    const chrome = r.chrome
    hovering(r)
    paste([imageFile()])
    r.dispose()
    rigs = []
    answer({ ok: false, error: 'unreadable' })
    await settle()
    expect(chrome.querySelector('.qc-drawing-status')?.textContent ?? '').toBe('')
  })
})
