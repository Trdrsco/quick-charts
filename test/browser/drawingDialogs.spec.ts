import { expect, test, type Page } from '@playwright/test'

// The drawing settings dialog as a browser lays it out: a chart from the installed package, over the
// conformance suite's scripted feed, with a new drawing's dialog open. Every check reads the painted
// layout, which a document without layout cannot.

test.use({ viewport: { width: 1280, height: 1000 } })

interface Box {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

/** Mount a chart filling the page, from the installed package, over the scripted feed. */
async function mount(page: Page): Promise<void> {
  await page.goto('/')
  await page.waitForFunction(() => typeof (window as unknown as { quickcharts?: unknown }).quickcharts === 'object')
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

/** Open the settings dialog of a new drawing of `type`, on `tab` when one is named. */
async function openSettings(page: Page, type: string, tab?: string): Promise<void> {
  await page.evaluate((type) => {
    const w = window as unknown as {
      quickcharts: { drawingTools: { get(t: string): { anchors: number }; create(t: string, id: string, a: unknown[]): { toJSON(): unknown } } }
      widget: { activeChart(): { drawings: { restore(list: unknown[]): void; select(id: string): void } }; commands: { execute(id: string): unknown } }
    }
    const tool = w.quickcharts.drawingTools.get(type)
    const start = 1_700_000_000 + 600 * 60
    const anchors = Array.from({ length: Math.max(1, tool.anchors) }, (_, i) => ({ time: start + i * 8 * 60, price: 150 + i }))
    const chart = w.widget.activeChart()
    chart.drawings.restore([w.quickcharts.drawingTools.create(type, `check-${type}`, anchors).toJSON()])
    chart.drawings.select(`check-${type}`)
    w.widget.commands.execute('chart.drawings.settings')
  }, type)
  const dialog = page.locator('[data-role="drawing-settings"]')
  await expect(dialog).toBeVisible()
  if (tab) await dialog.getByRole('tab', { name: tab, exact: true }).click()
}

/** Stand the dialog with its edge on one side of the viewport, as a viewer dragging it there leaves it. */
async function moveDialog(page: Page, edge: 'left' | 'right'): Promise<void> {
  await page.evaluate((edge) => {
    const box = document.querySelector<HTMLElement>('[data-role="drawing-settings"]')!
    box.style.position = 'fixed'
    box.style.top = '40px'
    box.style.left = edge === 'left' ? '0px' : `${document.documentElement.clientWidth - box.offsetWidth}px`
  }, edge)
}

/** The list a list button opens, against the button: both rects, and how wide each row's words and
 *  the row's own content are against the room they have. */
async function openList(page: Page, name: string): Promise<{ button: Box; list: Box; role: string; cut: string[]; overflow: string[] }> {
  const dialog = page.locator('[data-role="drawing-settings"]')
  await dialog.locator(`button[aria-label="${name}"][aria-haspopup]`).first().click()
  const list = page.locator(`[aria-label="${name}"]:is([role="listbox"], [role="menu"])`)
  await expect(list).toBeVisible()
  return page.evaluate((name) => {
    const rect = (el: Element): Box => {
      const r = el.getBoundingClientRect()
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
    }
    const button = document.querySelector(`[data-role="drawing-settings"] button[aria-label="${name}"][aria-haspopup]`)!
    const list = document.querySelector(`[aria-label="${name}"]:is([role="listbox"], [role="menu"])`)!
    const rows = [...list.querySelectorAll<HTMLElement>('[role="option"], [role="menuitemcheckbox"]')]
    return {
      button: rect(button),
      list: rect(list.closest('.qc-drawing-popover') ?? list),
      role: list.getAttribute('role') ?? '',
      cut: rows.filter((row) => {
        const words = row.querySelector<HTMLElement>('.qc-menu-label') ?? row
        return words.scrollWidth > words.clientWidth
      }).map((row) => row.textContent ?? ''),
      overflow: rows.filter((row) => row.scrollWidth > row.clientWidth).map((row) => row.textContent ?? ''),
    }
  }, name)
}

test.describe('a list button\'s list', () => {
  test('a list of choices opens flush under its button, at least as wide as it and as wide as its longest choice', async ({ page }) => {
    await mount(page)
    await openSettings(page, 'regression_trend', 'Inputs')
    const { button, list, role, cut, overflow } = await openList(page, 'Source')
    expect(role).toBe('listbox')
    expect(cut).toEqual([])
    expect(overflow).toEqual([])
    expect(list.width).toBeGreaterThanOrEqual(button.width - 0.5)
    expect(Math.abs(list.left - button.left)).toBeLessThanOrEqual(1)
    expect(Math.abs(list.top - button.bottom)).toBeLessThanOrEqual(1)
  })

  test('a list of switches stands as wide as its button, flush under it', async ({ page }) => {
    await mount(page)
    await openSettings(page, 'trend_line', 'Style')
    const { button, list, role, cut } = await openList(page, 'Extend')
    expect(role).toBe('menu')
    expect(cut).toEqual([])
    expect(Math.abs(list.width - button.width)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(list.left - button.left)).toBeLessThanOrEqual(1)
    expect(Math.abs(list.top - button.bottom)).toBeLessThanOrEqual(1)
  })

  test('a list of choices wider than its button stays inside the viewport at its edge', async ({ page }) => {
    await mount(page)
    await openSettings(page, 'regression_trend', 'Inputs')
    await moveDialog(page, 'right')
    const { list, cut } = await openList(page, 'Source')
    const viewport = page.viewportSize()!
    expect(cut).toEqual([])
    expect(list.left).toBeGreaterThanOrEqual(0)
    expect(list.right).toBeLessThanOrEqual(viewport.width)
  })
})
