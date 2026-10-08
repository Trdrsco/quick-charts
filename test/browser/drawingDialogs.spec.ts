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

interface PopoverReading {
  rect: Box
  viewport: { width: number; height: number }
  /** The ancestors whose overflow cuts the popover. */
  clippedBy: string[]
  /** Swatches in the palette's first row, and whether the last of them stands inside the popover. */
  columns: number
  lastInside: boolean
  scrollsAcross: boolean
  scrollsDown: boolean
  maxWidth: string
  /** The popover carries a stroke's Line style row, the widest of its rows. */
  stroke: boolean
}

/** Open the color popover of the `index`th color button named `name` (in the dialog, or on the
 *  settings bar for a `[data-qc-control]` name) and read it against the viewport and its ancestors. */
async function openColor(page: Page, name: string, index = 0): Promise<PopoverReading> {
  const before = await page.locator('.qc-drawing-popover').count()
  const opener = name.startsWith('[') ? page.locator(`.qc-drawing-settings-bar ${name}`) : page.locator(`[data-role="drawing-settings"] button[aria-label="${name}"]`).nth(index)
  await opener.click()
  await expect(page.locator('.qc-drawing-popover')).toHaveCount(before + 1)
  return page.evaluate(() => {
    const panel = [...document.querySelectorAll<HTMLElement>('.qc-drawing-popover')].pop()!
    const r = panel.getBoundingClientRect()
    const clippedBy: string[] = []
    for (let el = panel.parentElement; el; el = el.parentElement) {
      const style = getComputedStyle(el)
      if (style.overflowX === 'visible' && style.overflowY === 'visible') continue
      const c = el.getBoundingClientRect()
      if (r.left < c.left - 0.5 || r.top < c.top - 0.5 || r.right > c.right + 0.5 || r.bottom > c.bottom + 0.5) clippedBy.push(String(el.className))
    }
    const cells = [...panel.querySelectorAll<HTMLElement>('.qc-drawing-palette button')]
    const top = cells[0]!.getBoundingClientRect().top
    const row = cells.filter((cell) => Math.abs(cell.getBoundingClientRect().top - top) < 1)
    return {
      rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
      viewport: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
      clippedBy,
      columns: row.length,
      lastInside: row[row.length - 1]!.getBoundingClientRect().right <= r.right - 0.5,
      scrollsAcross: panel.scrollWidth > panel.clientWidth,
      scrollsDown: panel.scrollHeight > panel.clientHeight,
      maxWidth: getComputedStyle(panel).maxWidth,
      stroke: !!panel.querySelector('.qc-drawing-stroke-section--style'),
    }
  })
}

/** The popover keeps its whole width and grid, inside the viewport, cut by nothing. Its width is
 *  the palette's 248px, or 250px under a stroke's Line style row. */
function expectWhole(p: PopoverReading): void {
  expect(p.rect.width).toBeCloseTo(p.stroke ? 250 : 248, 0)
  expect(p.maxWidth).toBe('none')
  expect(p.columns).toBe(10)
  expect(p.lastInside).toBe(true)
  expect(p.scrollsAcross).toBe(false)
  expect(p.scrollsDown).toBe(false)
  expect(p.clippedBy).toEqual([])
  expect(p.rect.left).toBeGreaterThanOrEqual(0)
  expect(p.rect.top).toBeGreaterThanOrEqual(0)
  expect(p.rect.right).toBeLessThanOrEqual(p.viewport.width)
  expect(p.rect.bottom).toBeLessThanOrEqual(p.viewport.height)
}

test.describe('the color popover', () => {
  for (const [type, names] of [
    ['fib_retracement', ['Level 1 color', 'Level 2 color', 'Use one color', 'Trend line']],
    ['pitchfork', ['Use one color', 'Median']],
    ['gannbox_fan', ['Use one color']],
    ['fib_timezone', ['Use one color']],
    ['trend_line', ['Line']],
  ] as const) {
    for (const edge of ['open', 'left', 'right'] as const) {
      test(`${type}: every swatch's popover stands whole with the dialog ${edge === 'open' ? 'where it opens' : `at the viewport's ${edge} edge`}`, async ({ page }) => {
        await mount(page)
        await openSettings(page, type, 'Style')
        if (edge !== 'open') await moveDialog(page, edge)
        for (const name of names) {
          expectWhole(await openColor(page, name))
          await page.keyboard.press('Escape')
          await expect(page.locator('[data-role="drawing-settings"] .qc-drawing-popover, .qc-dialog-scrim > .qc-drawing-popover')).toHaveCount(0)
        }
      })
    }
  }

  test('a popover with only a sliver of room under its button keeps its whole height rather than scrolling', async ({ page }) => {
    await mount(page)
    await openSettings(page, 'trend_line', 'Style')
    const whole = await openColor(page, 'Line')
    await page.keyboard.press('Escape')
    // Stand the dialog so the button's bottom leaves the popover two pixels more than it needs.
    await page.evaluate((height) => {
      const box = document.querySelector<HTMLElement>('[data-role="drawing-settings"]')!
      const button = box.querySelector<HTMLElement>('button[aria-label="Line"]')!
      const target = document.documentElement.clientHeight - height - 2
      const shift = target - button.getBoundingClientRect().bottom
      const top = box.getBoundingClientRect().top
      box.style.position = 'fixed'
      box.style.left = '40px'
      box.style.top = `${top + shift}px`
    }, whole.rect.height)
    const tight = await openColor(page, 'Line')
    expectWhole(tight)
    expect(tight.rect.height).toBeCloseTo(whole.rect.height, 0)
  })

  test("the settings bar's color panels stand whole at either edge of the chart", async ({ page }) => {
    await mount(page)
    await page.evaluate(() => {
      const w = window as unknown as {
        quickcharts: { drawingTools: { create(t: string, id: string, a: unknown[]): { toJSON(): unknown } } }
        widget: { activeChart(): { drawings: { restore(list: unknown[]): void; select(id: string): void } } }
      }
      const start = 1_700_000_000 + 600 * 60
      const chart = w.widget.activeChart()
      chart.drawings.restore([w.quickcharts.drawingTools.create('rectangle', 'bar-rect', [{ time: start, price: 150 }, { time: start + 480, price: 152 }]).toJSON()])
      chart.drawings.select('bar-rect')
    })
    const bar = page.locator('.qc-drawing-settings-bar')
    await expect(bar).toBeVisible()
    for (const edge of ['open', 'left', 'right'] as const) {
      if (edge !== 'open') {
        await page.evaluate((edge) => {
          const el = document.querySelector<HTMLElement>('.qc-drawing-settings-bar')!
          const host = el.parentElement!.getBoundingClientRect()
          el.style.left = edge === 'left' ? '0px' : `${host.width - el.offsetWidth}px`
        }, edge)
      }
      for (const control of ['color', 'fill', 'text']) {
        expectWhole(await openColor(page, `[data-qc-control="${control}"]`))
        await page.keyboard.press('Escape')
        await expect(page.locator('.qc-drawing-popover')).toHaveCount(0)
      }
    }
  })
})

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

  test("a list of switches ticks each row with the settings rows' own checkbox and never inverts a ticked row", async ({ page }) => {
    await mount(page)
    await openSettings(page, 'long_position', 'Style')
    await openList(page, 'Stats')
    const rows = await page.evaluate(() => {
      const menu = document.querySelector('[aria-label="Stats"][role="menu"]')!
      const panel = getComputedStyle(menu.closest('.qc-drawing-popover')!).backgroundColor
      const shared = document.querySelector<HTMLInputElement>('[data-role="drawing-settings"] label.qc-drawing-toggle > input')!
      return [...menu.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')].map((row) => {
        const box = row.querySelector<HTMLInputElement>(':scope > input')
        return {
          ticked: row.getAttribute('aria-checked') === 'true',
          box: box?.className ?? null,
          shared: shared.className,
          boxTicked: box?.checked ?? null,
          boxGround: box ? getComputedStyle(box).backgroundColor : null,
          ground: getComputedStyle(row).backgroundColor,
          ink: getComputedStyle(row).color,
          panel,
        }
      })
    })
    expect(rows.filter((r) => r.ticked).length).toBeGreaterThan(0)
    expect(rows.filter((r) => !r.ticked).length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.box).toBe(r.shared)
      expect(r.boxTicked).toBe(r.ticked)
      expect(['rgba(0, 0, 0, 0)', r.panel]).toContain(r.ground)
    }
    // A ticked row reads in the same ink as a clear one; its box, not the row, says it is on.
    expect(new Set(rows.map((r) => r.ink)).size).toBe(1)
    expect(rows.find((r) => r.ticked)!.boxGround).not.toBe(rows.find((r) => !r.ticked)!.boxGround)
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
