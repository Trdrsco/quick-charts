import { expect, test, type Locator, type Page } from '@playwright/test'

// The replay bar's Select date dialog and its starting-point menu, laid out by a real browser and
// held to the reference capture's measurements to a pixel. Every rect is [x, y, width, height] in CSS
// pixels at device pixel ratio 1 in a 1344 by 1000 viewport, where the card stands centred. A width
// that follows the words (the heading, the chip, Cancel and Select) is held by the edges the words do
// not move, because the font a browser has decides their length.

test.use({ viewport: { width: 1344, height: 1000 }, deviceScaleFactor: 1 })

type Rect = readonly number[]

const CAPTURE = {
  card: [521, 208, 302, 584],
  title: [541, 228, 231, 28],
  close: [772, 225, 34, 34],
  dateField: [541, 293, 150, 34],
  timeField: [703, 293, 100, 34],
  calendar: [529, 343, 286, 332],
  previous: [544, 344, 34, 34],
  next: [766, 344, 34, 34],
  band: [541, 390, 262, 22],
  footer: [521, 725, 302, 67],
  timeList: [703, 327, 100, 231],
} as const

/** October 2026 opens on a Thursday: seven 34px columns and five 34px rows, each 38px from the next. */
const COLUMNS = [541, 579, 617, 655, 693, 731, 769]
const ROWS = [424, 462, 500, 538, 576]
const LEAD = 3

async function rect(locator: Locator): Promise<Rect> {
  const box = await locator.boundingBox()
  expect(box, 'laid out').not.toBeNull()
  return [box!.x, box!.y, box!.width, box!.height]
}

function near(actual: Rect, expected: Rect, what: string): void {
  expect(actual.length, what).toBe(expected.length)
  actual.forEach((value, i) => {
    expect(Math.abs(value - expected[i]!), `${what}: [${actual.map((v) => v.toFixed(1)).join(', ')}] against [${expected.join(', ')}]`).toBeLessThanOrEqual(1)
  })
}

/** A dark chart of thirty-minute bars from 14 September to 8 October 2026 filling the viewport, in
 *  replay and asking where to start, with the transport row standing open. */
async function mountReplay(page: Page): Promise<void> {
  await page.goto('/')
  await page.waitForFunction(() => typeof (window as unknown as { quickcharts?: unknown }).quickcharts === 'object')
  await page.evaluate(async () => {
    const first = Date.UTC(2026, 8, 14, 13, 30) / 1000
    const last = Date.UTC(2026, 9, 8, 15, 0) / 1000
    const bars: { t: number; o: number; h: number; l: number; c: number; v: number }[] = []
    for (let t = first, i = 0; t <= last; t += 1800, i++) {
      const c = 100 + Math.sin(i / 9) * 2
      bars.push({ t, o: c - 0.3, h: c + 0.6, l: c - 0.6, c, v: 100 })
    }
    const datafeed = {
      search: async () => ({ hits: [], hasMore: false }),
      resolve: async (symbol: string) => ({ ticker: symbol, name: symbol, description: symbol, exchange: 'TEST', listedExchange: 'TEST', type: 'index', supportedResolutions: [], timezone: 'Etc/UTC', session: '24x7', dataStatus: 'streaming', volumePrecision: 0, format: { pricescale: 100, minmov: 1 } }),
      history: async (_symbol: string, _tf: string, range?: { to?: number }) => ({ bars: bars.filter((bar) => bar.t <= (range?.to ?? Infinity)), noData: true }),
      subscribeBars: () => () => undefined,
    }
    const container = document.createElement('div')
    container.style.cssText = 'position: fixed; inset: 0'
    document.body.appendChild(container)
    const create = (window as unknown as { quickcharts: { createChart(options: object): { ready(): Promise<void>; activeChart(): { replay: { start(): void } } } } }).quickcharts.createChart
    const widget = create({ container, datafeed, symbol: 'TEST', timeframe: '30m', theme: { mode: 'dark' } })
    await widget.ready()
    widget.activeChart().replay.start()
  })
  const row = page.locator('.qc-replay')
  await expect(row).toHaveAttribute('data-state', 'open')
  await expect.poll(async () => (await rect(row))[3]).toBe(49)
  // The plot gives up the row's height and repaints on the frames after.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
}

async function openStartMenu(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Select starting point', exact: true }).click()
  const menu = page.getByRole('menu', { name: 'Select starting point' })
  await expect(menu).toBeVisible()
  return menu
}

async function openDateDialog(page: Page): Promise<Locator> {
  const menu = await openStartMenu(page)
  await menu.getByRole('menuitemradio', { name: 'Date…' }).click()
  const dialog = page.locator('[data-role="replay-date"]')
  await expect(dialog).toBeVisible()
  return dialog
}

test('the Select date dialog stands where the capture measured it', async ({ page }) => {
  await mountReplay(page)
  const dialog = await openDateDialog(page)
  near(await rect(dialog), CAPTURE.card, 'card')
  near(await rect(dialog.locator('.qc-date-title-text')), CAPTURE.title, 'title')
  near(await rect(dialog.getByRole('button', { name: 'Close', exact: true })), CAPTURE.close, 'close')
  near(await rect(dialog.locator('.qc-date-field')), CAPTURE.dateField, 'date field')
  near(await rect(dialog.locator('.qc-date-time')), CAPTURE.timeField, 'time field')
  near(await rect(dialog.locator('.qc-date-calendar')), CAPTURE.calendar, 'calendar')
  near(await rect(dialog.getByRole('button', { name: 'Previous month, September 2026' })), CAPTURE.previous, 'previous month')
  near(await rect(dialog.getByRole('button', { name: 'Next month, November 2026' })), CAPTURE.next, 'next month')
  near(await rect(dialog.locator('.qc-date-band')), CAPTURE.band, 'weekday band')
  near(await rect(dialog.locator('.qc-date-footer')), CAPTURE.footer, 'footer')

  // The heading and the chip stand centred on the card; Select ends 20px in and Cancel 12px before it.
  const [hx, hy, hw, hh] = await rect(dialog.locator('.qc-date-heading'))
  near([hx! + hw! / 2, hy!, hh!], [672, 344, 34], 'heading')
  const [cx, cy, cw, ch] = await rect(dialog.locator('.qc-date-first'))
  near([cx! + cw! / 2, cy!, ch!], [672, 675, 40], 'first available day chip')
  const [nx, ny, nw, nh] = await rect(dialog.getByRole('button', { name: 'Cancel', exact: true }))
  const [sx, sy, sw, sh] = await rect(dialog.getByRole('button', { name: 'Select', exact: true }))
  near([ny!, nh!, sy!, sh!, sx! + sw!, sx! - (nx! + nw!)], [742, 34, 742, 34, 803, 12], 'Cancel and Select')
})

test('the days of the month are 34px cells 4px apart, the first week against the end', async ({ page }) => {
  await mountReplay(page)
  const dialog = await openDateDialog(page)
  const cells = await dialog.locator('.qc-date-day').evaluateAll((days) => days.map((day) => {
    const r = day.getBoundingClientRect()
    return [r.x, r.y, r.width, r.height]
  }))
  expect(cells).toHaveLength(31)
  cells.forEach((cell, i) => {
    const slot = LEAD + i
    near(cell, [COLUMNS[slot % 7]!, ROWS[Math.floor(slot / 7)]!, 34, 34], `day ${i + 1}`)
  })
  // The chosen day, the last available one, opens on the emphasis fill with its number in black.
  const chosen = dialog.locator('.qc-date-day[aria-selected="true"]')
  await expect(chosen).toHaveText('8')
  await expect(chosen).toHaveCSS('background-color', 'rgb(242, 242, 242)')
  await expect(chosen).toHaveCSS('color', 'rgb(0, 0, 0)')
})

test('the time list hangs from the time field, as wide as it, its rows 32px', async ({ page }) => {
  await mountReplay(page)
  const dialog = await openDateDialog(page)
  await dialog.getByRole('button', { name: 'Choose a time' }).click()
  const list = page.getByRole('listbox')
  near(await rect(list), CAPTURE.timeList, 'time list')
  const [ox, oy, , oh] = await rect(list.getByRole('option').first())
  near([ox!, oy!, oh!], [703, 333, 32], 'first time')
  await expect(list.getByRole('option')).toHaveCount(96)
  await expect(dialog.locator('.qc-date-time')).toBeFocused()
})

test('no veil: the chart beside the dialog keeps every pixel, and the backdrop paints nothing', async ({ page }) => {
  await mountReplay(page)
  const clip = { x: 80, y: 140, width: 160, height: 160 }
  const before = await page.screenshot({ clip })
  const dialog = await openDateDialog(page)
  const backdrop = await dialog.evaluate((box) => {
    const scrim = box.parentElement!
    const style = getComputedStyle(scrim)
    return { veil: scrim.dataset.qcVeil, background: style.backgroundColor, opacity: style.opacity, filter: style.backdropFilter }
  })
  expect(backdrop.veil).toBe('none')
  expect(backdrop.background).toMatch(/^(rgba\(0, 0, 0, 0\)|transparent)$/)
  expect(backdrop.opacity).toBe('1')
  expect(['none', '']).toContain(backdrop.filter)
  const after = await page.screenshot({ clip })
  expect(after.equals(before)).toBe(true)
})

test('the starting-point menu is a 177px list under its question, its starting points on 34px rows', async ({ page }) => {
  await mountReplay(page)
  const arrow = await rect(page.getByRole('button', { name: 'Select starting point', exact: true }))
  const menu = await openStartMenu(page)
  const [mx, my, mw, mh] = await rect(menu)
  near([mw!, mh!, my! + mh!], [177, 172, arrow[1]! - 2], 'menu')
  near(await rect(menu.locator('.qc-menu-heading')), [mx!, my! + 6, 177, 24], 'question')
  const rows = menu.locator('[data-qc-item]')
  await expect(rows).toHaveText(['Bar', 'Date…', 'First available date', 'Random bar'])
  for (let i = 0; i < 4; i++) {
    const row = rows.nth(i)
    near(await rect(row), [mx!, my! + 30 + i * 34, 177, 34], `row ${i + 1}`)
    near(await rect(row.locator('svg')), [mx! + 8, my! + 33 + i * 34, 28, 28], `row ${i + 1} mark`)
  }
})
