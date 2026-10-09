import { expect, test, type Page } from '@playwright/test'
import { applyHostRules } from './hostRules'

// The chart on a page that lays global rules over everything it holds, as an application built on a
// utility framework does: a reset in a low cascade layer, an unlayered rule sizing every element by
// its border box, and a font, size and line height of the page's own on its body. The chart's
// dialogs, menus and panels stand on its layer, a child of the page's body, so those rules reach
// them. Every surface must stand as it does on a bare page.

test.use({ viewport: { width: 1280, height: 1000 } })

/** Mount a chart filling a page that carries the host's rules, from the installed package. */
async function mount(page: Page): Promise<void> {
  await page.goto('/')
  await page.waitForFunction(() => typeof (window as unknown as { quickcharts?: unknown }).quickcharts === 'object')
  await applyHostRules(page)
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

const run = (page: Page, id: string, arg?: unknown) =>
  page.evaluate(([id, arg]) => (window as unknown as { widget: { commands: { execute(id: string, arg?: unknown): unknown } } }).widget.commands.execute(id as string, arg), [id, arg] as const)

/** Stand a new drawing of `type` on the chart and select it. */
async function select(page: Page, type: string): Promise<void> {
  await page.evaluate((type) => {
    const w = window as unknown as {
      quickcharts: { drawingTools: { get(t: string): { anchors: number }; create(t: string, id: string, a: unknown[]): { toJSON(): unknown } } }
      widget: { activeChart(): { drawings: { restore(list: unknown[]): void; select(id: string): void } } }
    }
    const tool = w.quickcharts.drawingTools.get(type)
    const start = 1_700_000_000 + 600 * 60
    const anchors = Array.from({ length: Math.max(1, tool.anchors) }, (_, i) => ({ time: start + i * 8 * 60, price: 150 + i }))
    const chart = w.widget.activeChart()
    chart.drawings.restore([w.quickcharts.drawingTools.create(type, `host-${type}`, anchors).toJSON()])
    chart.drawings.select(`host-${type}`)
  }, type)
}

interface PaletteReading {
  /** Cells standing outside the palette's own box. */
  outside: number
  /** The room left between the palette with the room either side of it and the surface's content
   *  box, at the start and at the end: neither below zero. */
  room: [number, number]
  /** Swatches in the first row. */
  columns: number
  scrollsAcross: boolean
  width: number
}

/** Read the palette inside the newest surface matching `selector` against that surface. */
async function readPalette(page: Page, selector: string): Promise<PaletteReading> {
  return page.evaluate((selector) => {
    const surface = [...document.querySelectorAll<HTMLElement>(selector)].pop()!
    const palette = surface.querySelector<HTMLElement>('.qc-drawing-palette')!
    const p = palette.getBoundingClientRect()
    const ps = getComputedStyle(palette)
    const box = surface.getBoundingClientRect()
    const bs = getComputedStyle(surface)
    const px = (v: string): number => Number.parseFloat(v) || 0
    const contentLeft = box.left + px(bs.borderLeftWidth) + px(bs.paddingLeft)
    const contentRight = box.right - px(bs.borderRightWidth) - px(bs.paddingRight)
    const cells = [...palette.querySelectorAll<HTMLElement>('.qc-drawing-swatch, .qc-drawing-swatch-plus')].map((c) => c.getBoundingClientRect())
    const top = cells[0]!.top
    return {
      outside: cells.filter((c) => c.left < p.left - 0.5 || c.right > p.right + 0.5 || c.top < p.top - 0.5 || c.bottom > p.bottom + 0.5).length,
      room: [Math.round(p.left - px(ps.marginLeft) - contentLeft), Math.round(contentRight - (Math.max(...cells.map((c) => c.right)) + px(ps.marginRight)))] as [number, number],
      columns: cells.filter((c) => Math.abs(c.top - top) < 1).length,
      scrollsAcross: surface.scrollWidth > surface.clientWidth,
      width: box.width,
    }
  }, selector)
}

/** The palette's ten columns stand inside it, and it with its room inside the surface, which does
 *  not scroll across. */
function expectWhole(reading: PaletteReading, width?: number): void {
  expect(reading.outside).toBe(0)
  expect(reading.columns).toBe(10)
  expect(reading.room[0]).toBeGreaterThanOrEqual(0)
  expect(reading.room[1]).toBeGreaterThanOrEqual(0)
  expect(reading.scrollsAcross).toBe(false)
  if (width !== undefined) expect(reading.width).toBeCloseTo(width, 0)
}

test('every color surface holds its whole palette: the dialog popovers, the settings bar panels at either edge, and the panels the chart and indicator settings expand', async ({ page }) => {
  await mount(page)
  // The settings dialog's popovers: a stroke's, with its Line style row, and a level's.
  await select(page, 'trend_line')
  await run(page, 'chart.drawings.settings')
  const dialog = page.locator('[data-role="drawing-settings"]')
  await dialog.getByRole('tab', { name: 'Style', exact: true }).click()
  await dialog.locator('button[aria-label="Line"]').click()
  expectWhole(await readPalette(page, '.qc-drawing-popover'), 250)
  await page.keyboard.press('Escape')
  await dialog.locator('button[aria-label="Cancel"]').click()
  await select(page, 'fib_retracement')
  await run(page, 'chart.drawings.settings')
  await dialog.locator('button[aria-label="Level 1 color"]').click()
  expectWhole(await readPalette(page, '.qc-drawing-popover'), 248)
  await page.keyboard.press('Escape')
  await dialog.locator('button[aria-label="Cancel"]').click()
  // The settings bar's panels, with the bar where it opens and at either edge of the chart.
  await select(page, 'rectangle')
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
      await bar.locator(`[data-qc-control="${control}"]`).click()
      expectWhole(await readPalette(page, '.qc-drawing-popover'), 248)
      await page.keyboard.press('Escape')
      await expect(page.locator('.qc-drawing-popover')).toHaveCount(0)
    }
  }
  await page.evaluate(() => (window as unknown as { widget: { activeChart(): { drawings: { restore(list: unknown[]): void } } } }).widget.activeChart().drawings.restore([]))
  // The chart settings expand the palette in place under a color row.
  await page.locator('button[aria-label="Chart settings"]').click()
  const settings = page.locator('.qc-dialog').last()
  await settings.locator('.qc-drawing-swatch-button').first().click()
  expectWhole(await readPalette(page, '.qc-inline-panel'))
  expect(await settings.locator('.qc-chart-settings-panel').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(page.locator('.qc-dialog')).toHaveCount(0)
  // An indicator's settings do the same on its Style page.
  await run(page, 'chart.indicators.open')
  await page.locator('.qc-picker-name[data-indicator]').first().click()
  await page.keyboard.press('Escape')
  await expect(page.locator('.qc-dialog')).toHaveCount(0)
  await page.locator('.qc-legend button[aria-label="Indicator settings"]').first().click()
  const indicator = page.locator('.qc-dialog').last()
  await indicator.getByRole('tab').nth(1).click()
  await indicator.locator('.qc-drawing-swatch-button').first().click()
  expectWhole(await readPalette(page, '.qc-inline-panel'))
})

/** The boxes of a surface and everything in it, against the surface's own corner, read with the
 *  host's rules off and on: every box whose place or size differs. */
async function differences(page: Page, label: string, selector: string): Promise<string[]> {
  return page.evaluate(
    ([label, selector]) => {
      const sheet = document.querySelector<HTMLStyleElement>('style[data-host-rules]')!.sheet!
      const surface = [...document.querySelectorAll<HTMLElement>(selector)].pop()
      if (!surface) return [`${label}: no ${selector}`]
      const all = [surface, ...surface.querySelectorAll<HTMLElement>('*')]
      const read = (): number[][] => {
        const o = surface.getBoundingClientRect()
        return all.map((el) => {
          const r = el.getBoundingClientRect()
          return [r.left - o.left, r.top - o.top, r.width, r.height]
        })
      }
      sheet.disabled = true
      const bare = read()
      sheet.disabled = false
      const host = read()
      const name = (el: Element): string => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}${el.getAttribute('aria-label') ? ` "${el.getAttribute('aria-label')}"` : ''}`
      const round = (box: number[]): string => box.map((v) => Math.round(v * 10) / 10).join(', ')
      return all.flatMap((el, i) => (bare[i]!.some((v, k) => Math.abs(v - host[i]![k]!) > 0.5) ? [`${label}: ${name(el)} [${round(bare[i]!)}] under the host's rules [${round(host[i]!)}]`] : []))
    },
    [label, selector] as const,
  )
}

test("the chart's bars, dialogs, menus and panels lay out under a host page's global rules as they do on a bare page", async ({ page }) => {
  // Without motion, nothing moves between the two readings but what the rules move.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mount(page)
  const found: string[] = []
  for (const [label, selector] of [
    ['top bar', '.qc-topbar'],
    ['bottom bar', '.qc-bottombar'],
    ['drawing toolbar', '.qc-drawing-toolbar'],
    ['legend', '.qc-legend'],
  ] as const) found.push(...(await differences(page, label, selector)))
  // Every page of a spread of drawing dialogs.
  const dialog = page.locator('[data-role="drawing-settings"]')
  for (const type of ['fib_retracement', 'trend_line', 'long_position', 'note', 'table', 'signpost', 'image', 'regression_trend', 'gannbox', 'pitchfork']) {
    await select(page, type)
    await run(page, 'chart.drawings.settings')
    for (const tab of await dialog.getByRole('tab').allTextContents()) {
      await dialog.getByRole('tab', { name: tab, exact: true }).click()
      found.push(...(await differences(page, `${type} ${tab}`, '[data-role="drawing-settings"]')))
    }
    await dialog.locator('button[aria-label="Cancel"]').click()
  }
  // A stroke's color popover, its custom editor, a list and the Template menu.
  await select(page, 'trend_line')
  await run(page, 'chart.drawings.settings')
  await dialog.getByRole('tab', { name: 'Style', exact: true }).click()
  await dialog.locator('button[aria-label="Line"]').click()
  found.push(...(await differences(page, 'color popover', '.qc-drawing-popover')))
  await page.locator('.qc-drawing-popover .qc-drawing-swatch-plus').click()
  found.push(...(await differences(page, 'custom color editor', '.qc-drawing-popover')))
  await dialog.locator('button[aria-label="Line"]').click()
  await expect(page.locator('.qc-drawing-popover')).toHaveCount(0)
  await dialog.locator('button[aria-label="Extend"]').click()
  found.push(...(await differences(page, 'list', '.qc-drawing-popover')))
  await dialog.locator('button[aria-label="Extend"]').click()
  await dialog.locator('.qc-drawing-template-button').click()
  found.push(...(await differences(page, 'Template menu', '.qc-drawing-popover')))
  await dialog.locator('.qc-drawing-template-button').click()
  await dialog.locator('button[aria-label="Cancel"]').click()
  // The settings bar and its color panels.
  await select(page, 'rectangle')
  await expect(page.locator('.qc-drawing-settings-bar')).toBeVisible()
  found.push(...(await differences(page, 'settings bar', '.qc-drawing-settings-bar')))
  for (const control of ['color', 'fill', 'text']) {
    await page.locator(`.qc-drawing-settings-bar [data-qc-control="${control}"]`).click()
    found.push(...(await differences(page, `settings bar ${control} panel`, '.qc-drawing-popover')))
    await page.keyboard.press('Escape')
  }
  await page.evaluate(() => (window as unknown as { widget: { activeChart(): { drawings: { restore(list: unknown[]): void } } } }).widget.activeChart().drawings.restore([]))
  // The chart settings with a palette expanded, the symbol search, the indicator picker, the
  // compare dialog and the context menu.
  await page.locator('button[aria-label="Chart settings"]').click()
  await page.locator('.qc-dialog .qc-drawing-swatch-button').first().click()
  found.push(...(await differences(page, 'chart settings', '.qc-dialog')))
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(page.locator('.qc-dialog')).toHaveCount(0)
  for (const id of ['chart.symbol.search', 'chart.indicators.open', 'chart.compare.open']) {
    await run(page, id)
    await expect(page.locator('.qc-dialog')).toHaveCount(1)
    found.push(...(await differences(page, id, '.qc-dialog')))
    await page.keyboard.press('Escape')
    await expect(page.locator('.qc-dialog')).toHaveCount(0)
  }
  await page.mouse.click(400, 300, { button: 'right' })
  await expect(page.locator('.qc-menu')).toBeVisible()
  found.push(...(await differences(page, 'context menu', '.qc-menu')))
  expect(found).toEqual([])
})
