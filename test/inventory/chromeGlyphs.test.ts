// @vitest-environment happy-dom
// The chrome's glyph inventory: every top-bar control wears a mark or a word, each mark is drawn on
// the grid and at the weight the header was drawn at, and the two state pairs (fullscreen and its
// exit, a tile filling the layout and giving it back) are two marks rather than one reused twice.
//
// This pins geometry, not appearance: a glyph swapped for another silhouette, redrawn on a
// different grid, or restroked at another weight fails here before anyone opens a chart. The header
// order and its rules are pinned with them, because a mark in the wrong group reads as a different
// control.
import { afterEach, describe, expect, it } from 'vitest'
import { mountTopBar, TOP_BAR_SLOTS, type TopBarHandle } from '../../src/ui/chrome/topBar'
import { mountNavControls } from '../../src/ui/chrome/navControls'
import { ICONS, STYLE_ICONS, type Glyph } from '../../src/ui/controls/icons'
import { ARRANGEMENT_ICONS } from '../../src/ui/chrome/arrangementGlyphs'
import { ARRANGEMENTS } from '../../src/layoutGrid'
import { memoryChartStorage } from '../../src/storage'
import type { TopBarUi, UiConfig } from '../../src/widget/options'
import { buttonNames, fakeWidget } from '../chrome/harness'

let cleanup: (() => void)[] = []
afterEach(() => {
  for (const fn of cleanup.splice(0)) fn()
  document.body.replaceChildren()
})

function mount(options: { ui?: UiConfig; chartCount?: number } = {}): { bar: TopBarHandle; w: ReturnType<typeof fakeWidget> } {
  const w = fakeWidget({ ui: options.ui, chartCount: options.chartCount })
  const bar = mountTopBar({ ...w.ctx, ...w.topBarParts, ui: w.ui, storage: memoryChartStorage(), preferences: {}, saveLoad: null, autosave: w.autosave, openSearch: () => {}, notify: () => {} })
  document.body.appendChild(bar.element)
  cleanup.push(() => {
    bar.destroy()
    w.dispose()
  })
  return { bar, w }
}

/** One half of the bar as a reader meets it. An EMPTY host slot is structure rather than a control:
 *  it draws nothing, takes no width and earns no rule. A slot the host has filled is a control like
 *  any other and stays in the walk, which is what keeps the order below honest about a bar that a
 *  host has added to. */
const controls = (half: Element): Element[] =>
  [...half.children].filter((node) => !(node.classList.contains('qc-topbar-slot') && node.childElementCount === 0))

/** The one SVG a control carries, with the numbers a glyph is held to. */
interface Mark {
  viewBox: string
  width: string
  height: string
  strokes: string[]
  fills: number
}

function markOf(control: Element): Mark {
  const svg = control.querySelector('svg')
  if (!svg) throw new Error(`the control ${control.getAttribute('aria-label')} carries no glyph`)
  const paths = [...svg.querySelectorAll('path, circle, rect')]
  return {
    viewBox: svg.getAttribute('viewBox') ?? '',
    width: svg.getAttribute('width') ?? '',
    height: svg.getAttribute('height') ?? '',
    strokes: paths.filter((p) => p.getAttribute('stroke') === 'currentColor').map((p) => p.getAttribute('stroke-width') ?? ''),
    fills: paths.filter((p) => p.getAttribute('fill') === 'currentColor').length,
  }
}

/** A control by its accessible name, matched on the part the state does not rewrite. */
const byName = (root: ParentNode, prefix: string): HTMLButtonElement =>
  [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => (b.getAttribute('aria-label') ?? '').startsWith(prefix))!

describe('every top-bar control speaks', () => {
  it('leaves no control glyphless, whichever controls the host left standing', () => {
    const configs: (TopBarUi | undefined)[] = [
      undefined,
      { compare: false, indicators: false, replay: false },
      { symbol: false, timeframes: false, styles: false },
      { layouts: false, settings: false, fullscreen: false, image: false },
    ]
    for (const topBar of configs) {
      const { bar } = mount({ ui: topBar ? { topBar } : undefined })
      const controls = [...bar.element.querySelectorAll<HTMLButtonElement>('button')]
      expect(controls.length).toBeGreaterThan(0)
      // A header control says what it is with a mark or with a word: a timeframe chip is its own
      // name, Save is a link, and everything else wears a glyph. Nothing may be silent.
      for (const control of controls) {
        const speaks = control.querySelector('svg') !== null || (control.textContent ?? '').trim() !== ''
        expect(speaks, `${control.className} ${control.getAttribute('aria-label') ?? ''}`).toBe(true)
      }
    }
  })

  it('gives every arrangement in the catalog a mark, so the layout trigger is never blank', () => {
    // The trigger wears the ACTIVE arrangement's own glyph. A code the icon table has not met would
    // render an empty span, which is the one way this header can grow a glyphless control.
    const missing = ARRANGEMENTS.map((a) => a.code).filter((code) => !Object.hasOwn(ARRANGEMENT_ICONS, code) || !(ARRANGEMENT_ICONS as Readonly<Record<string, { body: string }>>)[code]!.body)
    expect(missing).toEqual([])
    const { bar } = mount()
    const trigger = markOf(byName(bar.element, 'Layout setup'))
    expect(trigger.viewBox).toBe('-1 -1 21 19')
    expect(trigger.width).toBe('21')
    expect(trigger.height).toBe('19')
  })

  it('keeps the approved header order and draws a rule only where a control follows it', () => {
    const { bar } = mount()
    const kind = (node: Element): string =>
      node.getAttribute('role') === 'separator' ? '|' : (node.getAttribute('aria-label') ?? '').split(':')[0]!.trim() || node.className
    // Symbol and compare; the timeframe picker; the style picker; Indicators; Replay; then Undo and
    // Redo flush together behind their own rule. Avatar, Alert and the host's trailing controls are
    // the host's and are not here.
    expect(controls(bar.element.querySelector('.qc-topbar-start')!).map(kind)).toEqual([
      'Search symbol',
      'Compare or add symbol',
      '|',
      'qc-tf',
      '|',
      'Chart style',
      '|',
      'Indicators',
      '|',
      'Bar replay',
      '|',
      'Undo',
      'Redo',
    ])
    // The trailing edge: the arrangement, the saved-layout menu, then settings, fullscreen, image.
    expect(controls(bar.element.querySelector('.qc-topbar-end')!).map(kind)).toEqual([
      'Layout setup',
      'qc-layouts',
      '|',
      'Chart settings',
      'Fullscreen',
      'Chart image',
    ])
    expect(buttonNames(bar.element)).toContain('Chart image')
  })

  it('offers the host a slot at every group boundary, empty and silent until one is filled', () => {
    const { bar } = mount()
    // Every slot is built whatever the features leave on, so a host composing a door never has to
    // reason about which of the chart's own groups happen to be present.
    const named = TOP_BAR_SLOTS.map((name) => bar.slot(name))
    expect(named.every((el) => el instanceof HTMLElement)).toBe(true)
    expect(named.every((el) => el.childElementCount === 0)).toBe(true)
    // Reading order, and each in the half of the bar its group belongs to.
    const attr = (half: string): string[] =>
      [...bar.element.querySelectorAll<HTMLElement>(`${half} .qc-topbar-slot`)].map((el) => el.dataset.qcSlot ?? '')
    expect(attr('.qc-topbar-start')).toEqual(['start', 'afterSymbol', 'afterTimeframe', 'afterStyle', 'afterIndicators', 'afterReplay', 'afterHistory'])
    expect(attr('.qc-topbar-end')).toEqual(['afterLayouts', 'end'])
    // A filled slot IS part of the order: it sits between the rule that closed Indicators and Replay.
    const door = document.createElement('button')
    door.setAttribute('aria-label', 'Price alerts')
    bar.slot('afterIndicators').appendChild(door)
    const start = [...bar.element.querySelector('.qc-topbar-start')!.children]
    expect(start.indexOf(bar.slot('afterIndicators'))).toBe(start.indexOf(byName(bar.element, 'Bar replay')) - 1)
  })

  it('hangs no rule when the group behind it is switched off', () => {
    const rules = (bar: TopBarHandle, half: string): string[] =>
      controls(bar.element.querySelector(half)!).map((c) => (c.getAttribute('role') === 'separator' ? '|' : 'x'))
    // The pill and the compare door, then the one rule the history group behind them earns.
    const bare = mount({ ui: { topBar: { timeframes: false, styles: false, indicators: false, replay: false } } }).bar
    expect(rules(bare, '.qc-topbar-start')).toEqual(['x', 'x', '|', 'x', 'x'])
    // With the history off too, the left half ends where the compare door does.
    const barest = mount({ ui: { topBar: { timeframes: false, styles: false, indicators: false, replay: false, history: false } } }).bar
    expect(rules(barest, '.qc-topbar-start')).toEqual(['x', 'x'])
    const layoutsOnly = mount({ ui: { topBar: { settings: false, fullscreen: false, image: false } } }).bar
    expect(rules(layoutsOnly, '.qc-topbar-end')).toEqual(['x', 'x'])
    // Replay off closes the group before it against the history rather than leaving a rule hanging.
    const noReplay = mount({ ui: { topBar: { replay: false } } }).bar
    expect(rules(noReplay, '.qc-topbar-start').filter((m) => m === '|')).toHaveLength(4)
    expect(rules(noReplay, '.qc-topbar-start').at(-1)).toBe('x')
  })
})

describe('the marks the baseline header drew', () => {
  it('draws each icon-only control on the grid and at the weight it was drawn at', () => {
    const { bar } = mount()
    const table: Record<string, Mark> = {
      compare: markOf(byName(bar.element, 'Compare or add symbol')),
      timeframe: markOf(bar.element.querySelector('.qc-tf-caret')!),
      style: markOf(byName(bar.element, 'Chart style')),
      indicators: markOf(byName(bar.element, 'Indicators')),
      replay: markOf(byName(bar.element, 'Bar replay')),
      undo: markOf(byName(bar.element, 'Undo')),
      redo: markOf(byName(bar.element, 'Redo')),
      layouts: markOf(bar.element.querySelector('.qc-layouts-caret')!),
      settings: markOf(byName(bar.element, 'Chart settings')),
      fullscreen: markOf(byName(bar.element, 'Fullscreen')),
      image: markOf(byName(bar.element, 'Chart image')),
    }
    expect(table).toEqual({
      compare: { viewBox: '0 0 28 28', width: '28', height: '28', strokes: [], fills: 2 },
      timeframe: { viewBox: '0 0 16 8', width: '8', height: '4', strokes: [], fills: 1 },
      // The trigger wears the ACTIVE style, which starts on candles: two bodies and their two wick
      // pairs, four filled subpaths rather than one. A body with an enclosed void needs its own
      // fill rule, and a wick drawn into the same path would inherit it and hollow out.
      style: { viewBox: '0 0 28 28', width: '28', height: '28', strokes: [], fills: 4 },
      // The trend line is a one-unit stroke over the filled bars.
      indicators: { viewBox: '0 0 28 28', width: '28', height: '28', strokes: [''], fills: 1 },
      replay: { viewBox: '0 0 28 28', width: '28', height: '28', strokes: [''], fills: 0 },
      // One filled mark each: the arc and its head are one outline.
      undo: { viewBox: '0 0 28 28', width: '28', height: '28', strokes: [], fills: 1 },
      redo: { viewBox: '0 0 28 28', width: '28', height: '28', strokes: [], fills: 1 },
      layouts: { viewBox: '0 0 16 8', width: '8', height: '4', strokes: [], fills: 1 },
      settings: { viewBox: '0 0 28 28', width: '28', height: '28', strokes: [], fills: 2 },
      fullscreen: { viewBox: '0 0 28 28', width: '28', height: '28', strokes: [], fills: 1 },
      image: { viewBox: '0 0 28 28', width: '28', height: '28', strokes: [], fills: 2 },
    })
  })

  it('takes the chart image as a walled camera body with its lens ring, not a stroked outline', () => {
    const { bar } = mount()
    const camera = markOf(byName(bar.element, 'Chart image'))
    // A one-unit wall, not a stroke: the body and the ring are each drawn as filled outlines.
    expect(camera.strokes).toEqual([])
    expect(camera.fills).toBe(2)
    expect(ICONS.camera.body).toContain('fill-rule="evenodd"')
  })

  it('gives fullscreen and its exit two marks: brackets out, then brackets in', () => {
    const { bar, w } = mount()
    const control = (): HTMLButtonElement => [...bar.element.querySelectorAll<HTMLButtonElement>('button')].find((b) => (b.getAttribute('aria-label') ?? '').toLowerCase().includes('fullscreen'))!
    const enter = markOf(control())
    expect(enter.viewBox).toBe('0 0 28 28')
    expect(enter.fills).toBe(1)
    expect(enter.strokes).toEqual([])
    void w.ctx.widget.fullscreen.toggle()
    bar.sync()
    const exit = markOf(control())
    expect(exit.viewBox).toBe('0 0 28 28')
    expect(exit.width).toBe('28')
    expect(exit.strokes).toEqual(['1.5'])
    expect(ICONS.fullscreen).not.toBe(ICONS.exitFullscreen)
  })

  it('gives a tile filling the layout and giving it back two marks on the 18 grid', () => {
    const w = fakeWidget({ chartCount: 2 })
    const chrome = document.createElement('div')
    const gestures = document.createElement('div')
    document.body.append(gestures, chrome)
    let maximized = false
    const nav = mountNavControls({ chrome, gestures, commands: w.commands, i18n: w.i18n, icons: w.icons, maximized: () => maximized })
    cleanup.push(() => (nav.destroy(), w.dispose()))
    // The tile's own control is the one that holds a state: the five view verbs just act.
    const control = (): HTMLButtonElement => chrome.querySelector<HTMLButtonElement>('.qc-nav button[aria-pressed]')!
    // Past one tile the control stands among the view verbs and is offered, not hidden.
    expect(chrome.querySelectorAll('.qc-nav button')).toHaveLength(6)
    expect(control().hidden).toBe(false)
    expect(markOf(control())).toEqual({ viewBox: '0 0 18 18', width: '18', height: '18', strokes: [], fills: 1 })
    expect(control().getAttribute('aria-label')).toBe('Maximize chart')
    expect(control().getAttribute('aria-pressed')).toBe('false')
    maximized = true
    nav.sync()
    expect(markOf(control())).toEqual({ viewBox: '0 0 18 18', width: '18', height: '18', strokes: [], fills: 1 })
    expect(control().getAttribute('aria-label')).toBe('Restore chart')
    expect(control().getAttribute('aria-pressed')).toBe('true')
    expect(ICONS.tileMaximize).not.toBe(ICONS.tileRestore)
  })

  it('hides the tile control on a single chart, where there is nothing to fill', () => {
    const w = fakeWidget({ chartCount: 1 })
    const chrome = document.createElement('div')
    const gestures = document.createElement('div')
    document.body.append(gestures, chrome)
    const nav = mountNavControls({ chrome, gestures, commands: w.commands, i18n: w.i18n, icons: w.icons, maximized: () => false })
    cleanup.push(() => (nav.destroy(), w.dispose()))
    expect(chrome.querySelector<HTMLButtonElement>('.qc-nav button[aria-pressed]')!.hidden).toBe(true)
  })

  it('opens the pickers with the baseline wide caret, half size on its own 16 by 8 grid', () => {
    const { bar } = mount()
    for (const selector of ['.qc-tf-caret', '.qc-layouts-caret']) {
      const caret = markOf(bar.element.querySelector(selector)!)
      expect(caret.viewBox).toBe('0 0 16 8')
      expect(caret.width).toBe('8')
      expect(caret.height).toBe('4')
      expect(caret.fills).toBe(1)
    }
  })

  it('registers no drawing twice: two names never carry the same artwork on the same grid', () => {
    const seen = new Map<string, string>()
    for (const [id, { viewBox, body }] of Object.entries(ICONS)) {
      const art = viewBox + body
      expect(seen.get(art), id).toBeUndefined()
      seen.set(art, id)
    }
  })

  it('registers no drawing twice: two names never carry the same artwork on the same grid', () => {
    const seen = new Map<string, string>()
    for (const [id, { viewBox, body }] of Object.entries(ICONS)) {
      const art = viewBox + body
      expect(seen.get(art), id).toBeUndefined()
      seen.set(art, id)
    }
  })

  it('holds every 28-grid chrome mark to the grid, and the style marks with it', () => {
    const marks: Record<string, Glyph> = { ...ICONS, ...STYLE_ICONS }
    for (const [id, { viewBox, body }] of Object.entries(marks)) {
      expect(body.length, id).toBeGreaterThan(0)
      // A mark on a grid of its own says so itself.
      if (viewBox !== '0 0 28 28') continue
      // A 28-grid mark's ink never runs past the grid: three-digit coordinates are the tell. An
      // arc's two flags written against its next coordinate ("0 012.09") are not one.
      expect(/[^0-9.](?![01]{2})\d{3,}(\.\d+)?/.test(body.replace(/stroke-width="[^"]*"/g, '')), id).toBe(false)
    }
  })

  it('keeps a mark for every glyph the header names, with none standing in for another', () => {
    // The header's own marks, listed so a deletion or a rename is a readable diff rather than a
    // control that quietly falls back to another glyph.
    for (const id of ['search', 'comparePlus', 'indicators', 'replay', 'undo', 'redo', 'settings', 'fullscreen', 'exitFullscreen', 'camera', 'tileMaximize', 'tileRestore', 'menuArrowWide'] as const) {
      expect(ICONS[id], id).toBeTruthy()
    }
    // The chevron the menus use is not what a picker trigger wears.
    expect(ICONS.chevronDown).not.toBe(ICONS.menuArrowWide)
    // A step back and a step forward are two drawn marks, not one turned around at render time.
    expect(ICONS.undo).not.toBe(ICONS.redo)
  })
})
