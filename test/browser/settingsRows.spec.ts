import { expect, test, type Page } from '@playwright/test'

// The chart settings in a window too short for their pages, so each page scrolls inside the dialog.
// Every row stands below the one before it: a row whose controls wrap onto a second line keeps that
// line, and the next row starts under it rather than over it.

test.use({ viewport: { width: 1440, height: 900 } })

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

/** Each row's controls on the page shown, top to bottom, as the overlaps between neighbours. */
function overlaps(): { page: string; rows: number; overlaps: string[] } {
  const panel = document.querySelector<HTMLElement>('.qc-chart-settings-panel')!
  const controls = [...panel.querySelectorAll<HTMLElement>(':scope > .qc-drawing-row > .qc-drawing-row-controls, :scope > .qc-drawing-row-controls')]
    .filter((el) => el.getClientRects().length > 0)
  const found: string[] = []
  for (let i = 1; i < controls.length; i += 1) {
    const above = controls[i - 1]!.getBoundingClientRect()
    const below = controls[i]!.getBoundingClientRect()
    if (below.top < above.bottom - 1) found.push(`${controls[i - 1]!.textContent?.trim().slice(0, 40)} over ${controls[i]!.textContent?.trim().slice(0, 40)}`)
  }
  return { page: document.querySelector('.qc-chart-settings-nav-item[aria-selected="true"]')?.getAttribute('data-settings-page') ?? '', rows: controls.length, overlaps: found }
}

test('every row of every chart settings page stands below the one before it while the page scrolls', async ({ page }) => {
  await mount(page)
  await page.evaluate(() => (window as unknown as { widget: { commands: { execute(id: string): unknown } } }).widget.commands.execute('chart.settings.open'))
  await expect(page.locator('.qc-chart-settings-panel')).toBeVisible()
  const tabs = page.locator('.qc-chart-settings-nav-item')
  const count = await tabs.count()
  expect(count).toBeGreaterThan(3)
  let scrolled = 0
  for (let i = 0; i < count; i += 1) {
    await tabs.nth(i).click()
    const reading = await page.evaluate(overlaps)
    expect(reading.overlaps, reading.page).toEqual([])
    const panel = page.locator('.qc-chart-settings-panel')
    if (await panel.evaluate((el) => el.scrollHeight > el.clientHeight + 1)) scrolled += 1
  }
  // At this height at least one page scrolls, which is where the rows used to overlap.
  expect(scrolled).toBeGreaterThan(0)
})
