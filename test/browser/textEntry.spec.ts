import { expect, test, type Page } from '@playwright/test'

// A text typed on the chart in a real browser: one click places it, the keyboard types two lines
// into a field nobody sees, Escape and a press elsewhere commit, and the chart's own canvas shows
// the words' frame while the text is selected and none once it is not.

/** The canvas pixels under a page point, one RGBA per pane canvas there. */
async function pixelsAt(page: Page, x: number, y: number): Promise<number[][]> {
  return page.evaluate(
    ([px, py]) => {
      const out: number[][] = []
      for (const canvas of Array.from(document.querySelectorAll('.qc-gestures canvas')) as HTMLCanvasElement[]) {
        const rect = canvas.getBoundingClientRect()
        if (px < rect.left || px >= rect.right || py < rect.top || py >= rect.bottom || rect.width === 0) continue
        const ctx = canvas.getContext('2d')
        if (!ctx) continue
        const scale = canvas.width / rect.width
        const data = ctx.getImageData(Math.floor((px - rect.left) * scale), Math.floor((py - rect.top) * scale), 1, 1).data
        out.push([data[0]!, data[1]!, data[2]!, data[3]!])
      }
      return out
    },
    [x, y] as const,
  )
}

/** Whether a canvas under a point shows the words' color, #2962ff, there. */
const framed = (pixels: number[][]): boolean => pixels.some(([r, g, b, a]) => a === 255 && Math.abs(r! - 41) <= 6 && Math.abs(g! - 98) <= 6 && Math.abs(b! - 255) <= 6)

const drawings = (page: Page) =>
  page.evaluate(() => {
    const api = (window as unknown as { chartWidget: { activeChart(): { drawings: { export(): { type: string; props?: { text?: string } }[]; selected(): { type: string } | null } } } }).chartWidget.activeChart().drawings
    return { texts: api.export().map((d) => d.props?.text), selected: api.selected()?.type ?? null }
  })

test('a text typed on the chart takes its keys in an invisible field and shows its frame on the canvas', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => typeof (window as unknown as { mountChart?: unknown }).mountChart === 'function')
  await page.evaluate(() => (window as unknown as { mountChart(): Promise<boolean> }).mountChart())
  const pane = (await page.locator('.qc-gestures').boundingBox())!
  await page.evaluate(() => (window as unknown as { chartWidget: { activeChart(): { drawings: { armTool(t: string): void } } } }).chartWidget.activeChart().drawings.armTool('text'))

  // One click places the text and opens its field.
  await page.mouse.click(pane.x + pane.width * 0.3, pane.y + pane.height * 0.3)
  const field = page.locator('textarea[data-qc-editor="inline"]')
  await expect(field).toBeFocused()
  const look = await field.evaluate((node) => {
    const s = getComputedStyle(node)
    return { opacity: s.opacity, border: s.borderTopStyle, borderWidth: s.borderTopWidth, outline: s.outlineStyle, shadow: s.boxShadow, background: s.backgroundColor }
  })
  expect(look).toEqual({ opacity: '0', border: 'none', borderWidth: '0px', outline: 'none', shadow: 'none', background: 'rgba(0, 0, 0, 0)' })
  await expect(field).toHaveAttribute('aria-label', 'Drawing text')

  // Two lines, from the real keyboard; the drawing's words change only as they commit.
  await page.keyboard.type('Hello world')
  await page.keyboard.press('Enter')
  await page.keyboard.type('line2')
  expect((await drawings(page)).texts).toEqual([])
  const box = (await field.boundingBox())!
  await page.mouse.move(pane.x + pane.width * 0.6, pane.y + pane.height * 0.8)
  // The field's box is the words' box: the frame's two pixel band stands just outside it.
  const left = { x: box.x - 1.5, y: box.y + 6 }
  const top = { x: box.x + 6, y: box.y - 1.5 }
  await expect.poll(async () => framed(await pixelsAt(page, left.x, left.y))).toBe(true)
  expect(framed(await pixelsAt(page, top.x, top.y))).toBe(true)

  // Escape commits the words as typed and keeps the text selected, its frame still painted.
  await page.keyboard.press('Escape')
  await expect(field).toHaveCount(0)
  expect(await drawings(page)).toEqual({ texts: ['Hello world\nline2'], selected: 'text' })
  await expect.poll(async () => framed(await pixelsAt(page, left.x, left.y))).toBe(true)

  // A press elsewhere deselects it, and the frame goes.
  await page.mouse.click(pane.x + pane.width * 0.6, pane.y + pane.height * 0.75)
  expect((await drawings(page)).selected).toBeNull()
  await expect.poll(async () => framed(await pixelsAt(page, left.x, left.y))).toBe(false)

  // A second text commits on that press too.
  await page.evaluate(() => (window as unknown as { chartWidget: { activeChart(): { drawings: { armTool(t: string): void } } } }).chartWidget.activeChart().drawings.armTool('text'))
  await page.mouse.click(pane.x + pane.width * 0.3, pane.y + pane.height * 0.55)
  await expect(field).toBeFocused()
  await page.keyboard.type('Two')
  await page.mouse.click(pane.x + pane.width * 0.6, pane.y + pane.height * 0.75)
  await expect(field).toHaveCount(0)
  expect(await drawings(page)).toEqual({ texts: ['Hello world\nline2', 'Two'], selected: null })
})
