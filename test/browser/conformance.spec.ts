import { expect, test } from '@playwright/test'
test('the production bundle passes the public chart conformance suite', async ({ page, browser }, testInfo) => {
  await page.goto('/')
  await page.waitForFunction(() => typeof (window as any).runChartConformance === 'function')
  const results = await page.evaluate(() => (window as any).runChartConformance()) as { id: string; status: string; detail?: string }[]
  await testInfo.attach('browser-conformance.json', { body: JSON.stringify({ browser: browser.version(), results }, null, 2), contentType: 'application/json' })
  expect(results.length).toBeGreaterThan(30)
  expect(results.filter(result => result.status === 'failed')).toEqual([])
})
