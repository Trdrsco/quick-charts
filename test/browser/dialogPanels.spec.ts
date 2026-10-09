import { expect, test, type Page } from '@playwright/test'
import { applyHostRules } from './hostRules'

// Every panel a drawing's settings dialog raises, for every tool in the catalog, read for what a
// viewer sees: the panel stands whole and nothing of the dialog paints over it. On every page of
// every tool's dialog, each color button's popover, each list button's list and the emoji picker
// open in turn, and the Template menu once; the browser's hit test at the panel's corners, edges
// and middle, and at the middle of every cell and row it shows, must land on the panel. A color
// popover's cells stand inside its palette, and its palette inside the popover. The sweep runs on a
// bare page and under a host page's global rules.

test.use({ viewport: { width: 1280, height: 1000 } })

/** Mount a chart filling the page, from the installed package, over the scripted feed. */
async function mount(page: Page, host: boolean): Promise<void> {
  await page.goto('/')
  await page.waitForFunction(() => typeof (window as unknown as { quickcharts?: unknown }).quickcharts === 'object')
  if (host) await applyHostRules(page)
  await page.evaluate(() => {
    const { createChart, scriptedFeed } = (window as unknown as { quickcharts: { createChart(o: unknown): unknown; scriptedFeed(): unknown } }).quickcharts
    document.body.style.margin = '0'
    const container = document.createElement('div')
    container.style.cssText = 'position:fixed;inset:0'
    document.body.appendChild(container)
    ;(window as unknown as { widget: unknown }).widget = createChart({ container, datafeed: scriptedFeed(), symbol: 'ALPHA', timeframe: '1m', theme: { mode: 'dark' } })
  })
  await page.waitForFunction(() => !!document.querySelector('[data-qc-theme] canvas'))
}

/** One panel that failed: where it was opened from, and what the hit test or the measure found. */
interface Finding {
  page: string
  opener: string
  kind: string
  what: string
}

interface ToolSweep {
  type: string
  /** Why the tool was not swept, when it was not. */
  skipped?: string
  pages: number
  colors: number
  lists: number
  menus: number
  findings: Finding[]
}

/** Open the settings dialog of a new drawing of `type` and raise every panel it can, in the page. */
function sweepTool(type: string): ToolSweep {
  const w = window as unknown as {
    quickcharts: { drawingTools: { get(t: string): { anchors: number }; create(t: string, id: string, a: unknown[]): { toJSON(): unknown } | null } }
    widget: { activeChart(): { drawings: { restore(list: unknown[]): void; select(id: string): void } }; commands: { execute(id: string): unknown } }
  }
  const out: ToolSweep = { type, pages: 0, colors: 0, lists: 0, menus: 0, findings: [] }
  const tool = w.quickcharts.drawingTools.get(type)!
  const start = 1_700_000_000 + 600 * 60
  const anchors = Array.from({ length: Math.max(1, tool.anchors) }, (_, i) => ({ time: start + i * 8 * 60, price: 150 + i }))
  const drawing = w.quickcharts.drawingTools.create(type, `sweep-${type}`, anchors)
  if (!drawing) return { ...out, skipped: 'the catalog builds no drawing at these anchors' }
  const chart = w.widget.activeChart()
  chart.drawings.restore([drawing.toJSON()])
  chart.drawings.select(`sweep-${type}`)
  w.widget.commands.execute('chart.drawings.settings')
  const dialog = document.querySelector<HTMLElement>('[data-role="drawing-settings"]')
  if (!dialog) return { ...out, skipped: 'no settings dialog' }

  const name = (el: Element | null): string => {
    if (!el) return 'nothing'
    const label = el.getAttribute('aria-label') ?? el.closest('[aria-label]')?.getAttribute('aria-label')
    return `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}${label ? ` "${label}"` : ''}`
  }
  const panels = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.qc-drawing-popover')]
  /** The newest panel raised by a press on `opener`, or null when none came up. */
  const raise = (opener: HTMLElement): HTMLElement | null => {
    const before = new Set(panels())
    opener.click()
    return panels().find((p) => !before.has(p)) ?? null
  }
  /** Whether the middle of `item` stands inside every scrolling box between it and the panel: a
   *  row a list has scrolled out of sight is not a row the viewer sees. */
  const inSight = (item: HTMLElement, panel: HTMLElement): boolean => {
    const c = item.getBoundingClientRect()
    const x = c.left + c.width / 2
    const y = c.top + c.height / 2
    if (!(c.width > 0 && c.height > 0)) return false
    for (let el: HTMLElement | null = item.parentElement; el; el = el === panel ? null : el.parentElement) {
      const s = getComputedStyle(el)
      if (s.overflowX === 'visible' && s.overflowY === 'visible') continue
      const b = el.getBoundingClientRect()
      const left = b.left + el.clientLeft
      const top = b.top + el.clientTop
      if (x < left || x > left + el.clientWidth || y < top || y > top + el.clientHeight) return false
    }
    return true
  }
  /** Every point of the panel that the hit test must answer with the panel: the middle of each
   *  rounded corner, a pixel in from the middle of each edge, its middle, and the middle of every
   *  item it holds. A color popover never scrolls, so every one of its cells is held to it; a list
   *  is held to the rows it shows. */
  const probe = (panel: HTMLElement, items: readonly HTMLElement[], all: boolean): string[] => {
    const r = panel.getBoundingClientRect()
    const corner = Math.max(1, Number.parseFloat(getComputedStyle(panel).borderTopLeftRadius) || 0)
    const points: [string, number, number][] = [
      ['top-left corner', r.left + corner, r.top + corner],
      ['top-right corner', r.right - corner, r.top + corner],
      ['bottom-left corner', r.left + corner, r.bottom - corner],
      ['bottom-right corner', r.right - corner, r.bottom - corner],
      ['top edge', r.left + r.width / 2, r.top + 1],
      ['bottom edge', r.left + r.width / 2, r.bottom - 1],
      ['left edge', r.left + 1, r.top + r.height / 2],
      ['right edge', r.right - 1, r.top + r.height / 2],
      ['middle', r.left + r.width / 2, r.top + r.height / 2],
    ]
    for (const item of items) {
      if (!all && !inSight(item, panel)) continue
      const c = item.getBoundingClientRect()
      points.push([name(item), c.left + c.width / 2, c.top + c.height / 2])
    }
    const misses: string[] = []
    for (const [where, x, y] of points) {
      const hit = document.elementFromPoint(x, y)
      if (hit && (hit === panel || panel.contains(hit))) continue
      misses.push(`${where} at (${Math.round(x)}, ${Math.round(y)}) is under ${name(hit)}`)
    }
    return misses
  }
  /** A color popover's cells stand inside its palette, and the palette with the room either side
   *  of it inside the popover, which does not scroll across. */
  const measure = (panel: HTMLElement): string[] => {
    const palette = panel.querySelector<HTMLElement>('.qc-drawing-palette')
    if (!palette) return ['no palette']
    const p = palette.getBoundingClientRect()
    const s = getComputedStyle(palette)
    const box = panel.getBoundingClientRect()
    const out: string[] = []
    for (const cell of palette.querySelectorAll<HTMLElement>('.qc-drawing-swatch, .qc-drawing-swatch-plus')) {
      const c = cell.getBoundingClientRect()
      if (c.left < p.left - 0.5 || c.right > p.right + 0.5 || c.top < p.top - 0.5 || c.bottom > p.bottom + 0.5) out.push(`${name(cell)} [${Math.round(c.left)}, ${Math.round(c.right)}] stands outside the palette [${Math.round(p.left)}, ${Math.round(p.right)}]`)
    }
    const left = p.left - Number.parseFloat(s.marginLeft)
    const right = p.right + Number.parseFloat(s.marginRight)
    if (left < box.left - 0.5 || right > box.right + 0.5) out.push(`the palette with its room [${Math.round(left)}, ${Math.round(right)}] stands outside the popover [${Math.round(box.left)}, ${Math.round(box.right)}]`)
    if (panel.scrollWidth > panel.clientWidth) out.push(`the popover scrolls across: ${panel.scrollWidth} in ${panel.clientWidth}`)
    return out
  }
  const check = (label: string, opener: HTMLElement, kind: 'color' | 'list' | 'menu'): void => {
    const panel = raise(opener)
    const opened = opener.getAttribute('aria-label') ?? opener.textContent ?? ''
    if (!panel) {
      out.findings.push({ page: label, opener: opened, kind, what: 'no panel came up' })
      return
    }
    out[kind === 'color' ? 'colors' : kind === 'list' ? 'lists' : 'menus']++
    const items = [...panel.querySelectorAll<HTMLElement>(kind === 'color' ? '.qc-drawing-palette button, .qc-drawing-segment' : '[role="option"], [role="menuitem"], [role="menuitemcheckbox"], [role="tab"], .qc-drawing-glyph-cell')]
    for (const what of [...probe(panel, items, kind === 'color'), ...(kind === 'color' ? measure(panel) : [])]) out.findings.push({ page: label, opener: opened, kind, what })
    opener.click()
    if (panel.isConnected) out.findings.push({ page: label, opener: opened, kind, what: 'a second press left the panel up' })
  }

  const tabs = [...dialog.querySelectorAll<HTMLElement>('[role="tab"]')]
  for (const tab of tabs) {
    tab.click()
    out.pages++
    const label = tab.textContent ?? ''
    const page = dialog.querySelector<HTMLElement>('.qc-drawing-page')!
    const openers = [...page.querySelectorAll<HTMLButtonElement>('button[aria-haspopup], button.qc-drawing-emoji-button')].filter((b) => !b.disabled && !b.closest('[hidden]'))
    for (const opener of openers) {
      opener.scrollIntoView({ block: 'nearest' })
      check(label, opener, opener.classList.contains('qc-drawing-swatch-button') ? 'color' : 'list')
    }
  }
  const template = dialog.querySelector<HTMLButtonElement>('.qc-drawing-template-button')
  if (template && !template.disabled) check('footer', template, 'menu')
  dialog.querySelector<HTMLButtonElement>('button[aria-label="Cancel"]')!.click()
  return out
}

for (const host of [false, true]) {
  test(`every panel a settings dialog raises stands whole over the dialog's controls, for every tool and page${host ? ", under a host page's global rules" : ''}`, async ({ page }) => {
    await mount(page, host)
    const types = await page.evaluate(() => (window as unknown as { quickcharts: { drawingTools: { all(): { type: string }[] } } }).quickcharts.drawingTools.all().map((t) => t.type))
    const swept: ToolSweep[] = []
    for (const type of types) {
      swept.push(await page.evaluate(sweepTool, type))
      await expect(page.locator('[data-role="drawing-settings"]')).toHaveCount(0)
    }
    const findings = swept.flatMap((s) => s.findings.map((f) => `${s.type} ${f.page}, ${f.kind} "${f.opener}": ${f.what}`))
    const colors = swept.reduce((n, s) => n + s.colors, 0)
    const lists = swept.reduce((n, s) => n + s.lists, 0)
    const menus = swept.reduce((n, s) => n + s.menus, 0)
    const withColors = swept.filter((s) => s.colors > 0).map((s) => s.type)
    test.info().annotations.push({
      type: 'coverage',
      description: `${types.length} tools, ${swept.filter((s) => !s.skipped).length} dialogs, ${swept.reduce((n, s) => n + s.pages, 0)} pages, ${withColors.length} tools with color buttons, ${colors} color popovers, ${lists} lists, ${menus} Template menus; skipped: ${swept.filter((s) => s.skipped).map((s) => `${s.type} (${s.skipped})`).join(', ') || 'none'}`,
    })
    expect(findings).toEqual([])
    // The sweep reached the dialogs it exists for.
    for (const type of ['fib_retracement', 'pitchfork', 'gannbox', 'trend_line', 'long_position', 'regression_trend', 'callout', 'table', 'signpost']) expect(withColors).toContain(type)
    expect(colors).toBeGreaterThan(400)
    expect(lists).toBeGreaterThan(150)
    expect(menus).toBe(swept.filter((s) => !s.skipped).length)
  })
}
