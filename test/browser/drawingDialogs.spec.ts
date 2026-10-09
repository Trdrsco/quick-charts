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

/** Mount a chart filling the page, from the installed package, over the scripted feed, with an
 *  asset port that refuses every picture when `assets` is set, so the Image tool's picker opens. */
async function mount(page: Page, assets = false): Promise<void> {
  await page.goto('/')
  await page.waitForFunction(() => typeof (window as unknown as { quickcharts?: unknown }).quickcharts === 'object')
  await page.evaluate((assets) => {
    const { createChart, scriptedFeed } = (window as unknown as { quickcharts: { createChart(o: unknown): unknown; scriptedFeed(): unknown } }).quickcharts
    document.body.style.margin = '0'
    const container = document.createElement('div')
    container.style.cssText = 'position:fixed;inset:0'
    document.body.appendChild(container)
    const port = { intakeImage: async () => ({ ok: false, error: 'unreadable' }), glyphSource: () => null }
    ;(window as unknown as { widget: unknown }).widget = createChart({ container, datafeed: scriptedFeed(), symbol: 'ALPHA', timeframe: '1m', theme: { mode: 'dark' }, ...(assets ? { assets: port } : {}) })
  }, assets)
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

test.describe('the settings fields', () => {
  test("read in the chart's own font on every page, no control falling back to the browser's", async ({ page }) => {
    await mount(page)
    const off: string[] = []
    for (const type of ['long_position', 'fib_retracement', 'trend_line', 'image']) {
      await openSettings(page, type)
      const tabs = await page.locator('[data-role="drawing-settings"] [role="tab"]').allTextContents()
      for (const tab of tabs) {
        await page.locator('[data-role="drawing-settings"]').getByRole('tab', { name: tab, exact: true }).click()
        off.push(
          ...(await page.evaluate(() => {
            const box = document.querySelector('[data-role="drawing-settings"]')!
            const root = box.closest('[data-qc-theme]')!
            const norm = (family: string): string => family.replace(/["'\s]/g, '').toLowerCase()
            const stack = norm(getComputedStyle(root).getPropertyValue('--qc-text-fontFamily'))
            return [...box.querySelectorAll<HTMLElement>('*')]
              .filter((el) => !el.closest('svg') && norm(getComputedStyle(el).fontFamily) !== stack)
              .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).trim().split(/\s+/).join('.')}`)
          })),
        )
      }
      await page.locator('[data-role="drawing-settings"] button[aria-label="Cancel"]').click()
    }
    expect([...new Set(off)]).toEqual([])
  })

  test('a number field keeps 63px for its words and a 22 by 28 slot for its steppers, which a field that cannot be used gives up', async ({ page }) => {
    await mount(page)
    await openSettings(page, 'long_position', 'Inputs')
    const entry = page.locator('[data-role="drawing-settings"] .qc-drawing-number-wrap').filter({ has: page.locator('input[aria-label="Entry price"]') })
    await entry.hover()
    const read = (wrap: typeof entry) =>
      wrap.evaluate((el) => {
        const box = el.getBoundingClientRect()
        const input = el.querySelector('input')!
        const s = getComputedStyle(input)
        const slot = el.querySelector('.qc-drawing-steppers')!.getBoundingClientRect()
        const px = (v: string): number => Number.parseFloat(v) || 0
        const probe = input.cloneNode() as HTMLInputElement
        probe.removeAttribute('id')
        probe.style.setProperty('line-height', '0', 'important')
        el.append(probe)
        const floor = px(getComputedStyle(probe).lineHeight)
        probe.remove()
        return {
          width: box.width,
          height: box.height,
          words: [px(s.borderLeftWidth) + px(s.paddingLeft), box.width - px(s.borderRightWidth) - px(s.paddingRight)],
          slot: slot.width ? [slot.left - box.left, slot.top - box.top, slot.width, slot.height] : null,
          size: s.fontSize,
          line: s.lineHeight,
          floor,
        }
      })
    const field = await read(entry)
    expect(field.width).toBe(100)
    expect(field.height).toBe(34)
    expect(field.words).toEqual([8, 71])
    expect(field.slot).toEqual([75, 3, 22, 28])
    // An engine may raise a one-line input's line height to its font's normal line height, which the same field at 0 reads.
    expect([field.size, field.line]).toEqual(['14px', `${Math.max(18, field.floor)}px`])
    // A level switched off: its field keeps no slot and shows no steppers, its words running on.
    await page.locator('[data-role="drawing-settings"] button[aria-label="Cancel"]').click()
    await openSettings(page, 'fib_retracement', 'Style')
    const off = page.locator('[data-role="drawing-settings"] .qc-drawing-number-wrap').filter({ has: page.locator('input:disabled') }).first()
    await off.hover()
    const disabled = await read(off)
    expect(disabled.words).toEqual([8, 95])
    expect(disabled.slot).toBeNull()
  })
})

/** Wait until the image picker stands at rest. It opens on the modal motion, growing from the
 *  entrance scale, so its painted box is its layout only once the box's own transitions have
 *  finished; a painted size that happens to match the layout box is no such signal. */
async function pickerAtRest(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const box = document.querySelector<HTMLElement>('[data-role="drawing-image-picker"]')
    return !!box && box.parentElement?.dataset.state === 'open' && box.getAnimations().length === 0
  })
}

test.describe('the image picker', () => {
  test("ends with the settings dialog's footer: Cancel and Ok at the end, in the same footer buttons", async ({ page }) => {
    await mount(page, true)
    const read = (role: string) =>
      page.evaluate((role) => {
        const footer = document.querySelector(`[data-role="${role}"] .qc-drawing-dialog-footer`)!
        const f = footer.getBoundingClientRect()
        const buttons = [...footer.querySelectorAll<HTMLElement>('button[aria-label="Cancel"], button[aria-label="Ok"]')]
        return {
          justify: getComputedStyle(footer).justifyContent,
          buttons: buttons.map((b) => {
            const r = b.getBoundingClientRect()
            const s = getComputedStyle(b)
            return { label: b.getAttribute('aria-label'), fromEnd: Math.round(f.right - r.right), width: Math.round(r.width), height: r.height, radius: s.borderTopLeftRadius, size: s.fontSize, line: s.lineHeight, padding: s.padding, edge: s.borderTopColor, family: s.fontFamily }
          }),
        }
      }, role)
    await openSettings(page, 'trend_line', 'Style')
    const settings = await read('drawing-settings')
    await page.locator('[data-role="drawing-settings"] button[aria-label="Cancel"]').click()
    await expect(page.locator('[data-role="drawing-settings"]')).toHaveCount(0)
    await page.evaluate(() => (window as unknown as { widget: { commands: { execute(id: string, arg?: unknown): unknown } } }).widget.commands.execute('chart.drawings.arm', 'image'))
    await expect(page.locator('[data-role="drawing-image-picker"]')).toBeVisible()
    await pickerAtRest(page)
    const picker = await read('drawing-image-picker')
    expect(picker.justify).toBe('flex-end')
    expect(picker.buttons.map((b) => b.label)).toEqual(['Cancel', 'Ok'])
    // Ok stands 20px in from the footer's end and Cancel 12px before it, as in the settings dialog.
    expect(picker.buttons[1]!.fromEnd).toBe(20)
    expect(picker.buttons[0]!.fromEnd).toBe(20 + picker.buttons[1]!.width + 12)
    const metrics = (b: (typeof picker.buttons)[number]) => ({ width: b.width, height: b.height, radius: b.radius, size: b.size, line: b.line, padding: b.padding, family: b.family, fromEnd: b.fromEnd })
    expect(picker.buttons.map(metrics)).toEqual(settings.buttons.map(metrics))
    expect(picker.buttons[0]!.edge).toBe(settings.buttons[0]!.edge)
  })

  test("stands a 380px card under the settings dialog's header, its drop box 8px under it and its transparency's 180px track at the end of its own line", async ({ page }) => {
    await mount(page, true)
    await page.evaluate(() => (window as unknown as { widget: { commands: { execute(id: string, arg?: unknown): unknown } } }).widget.commands.execute('chart.drawings.arm', 'image'))
    await expect(page.locator('[data-role="drawing-image-picker"]')).toBeVisible()
    await pickerAtRest(page)
    const parts = await page.evaluate(() => {
      const box = document.querySelector('[data-role="drawing-image-picker"]')!
      const card = box.getBoundingClientRect()
      const at = (selector: string): number[] => {
        const r = box.querySelector(selector)!.getBoundingClientRect()
        return [r.left - card.left, r.top - card.top, r.width, r.height].map((v) => Math.round(v))
      }
      const title = getComputedStyle(box.querySelector('.qc-drawing-dialog-title')!)
      return { width: card.width, header: at('.qc-drawing-dialog-header'), title: [title.fontSize, title.fontWeight, title.lineHeight], zone: at('.qc-drawing-drop'), track: at('.qc-drawing-picker-opacity input'), footer: at('.qc-drawing-dialog-footer') }
    })
    expect(parts.width).toBe(380)
    expect(parts.header).toEqual([0, 0, 380, 68])
    expect(parts.title).toEqual(['20px', '600', '28px'])
    expect(parts.zone).toEqual([20, 76, 340, 190])
    expect(parts.track.slice(0, 1)).toEqual([180])
    expect(parts.track.slice(2)).toEqual([180, 10])
    expect(parts.footer[3]).toBe(67)
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

  test('rings the row the keyboard is on inside its own edge, with no outline outside it', async ({ page }) => {
    await mount(page)
    await openSettings(page, 'regression_trend', 'Inputs')
    // The arrows open the list from the keyboard, and the keyboard lands on the chosen row.
    await page.locator('[data-role="drawing-settings"] button[aria-label="Source"][aria-haspopup]').focus()
    await page.keyboard.press('ArrowDown')
    await expect(page.locator('[aria-label="Source"][role="listbox"]')).toBeVisible()
    await page.keyboard.press('ArrowDown')
    const ring = await page.evaluate(() => {
      const row = document.activeElement as HTMLElement
      const r = row.getBoundingClientRect()
      const after = getComputedStyle(row, '::after')
      const before = getComputedStyle(row, '::before')
      return {
        role: row.getAttribute('role'),
        outline: getComputedStyle(row).outlineStyle,
        ring: [after.borderTopWidth, after.borderTopColor, after.borderTopLeftRadius],
        ringSize: [Number.parseFloat(after.width) - r.width, Number.parseFloat(after.height) - r.height],
        gap: [before.borderTopWidth, before.borderTopLeftRadius],
        gapSize: [r.width - Number.parseFloat(before.width), r.height - Number.parseFloat(before.height)],
      }
    })
    expect(ring.role).toBe('option')
    expect(ring.outline).toBe('none')
    // A 2px ring in the focus color on a 6px corner, as large as the row itself.
    expect(ring.ring).toEqual(['2px', 'rgb(41, 98, 255)', '6px'])
    for (const d of ring.ringSize) expect(Math.abs(d)).toBeLessThan(0.5)
    // Inside it, 2px of the list's ground on a 4px corner, 2px in from every side.
    expect(ring.gap).toEqual(['2px', '4px'])
    for (const d of ring.gapSize) expect(Math.abs(d - 4)).toBeLessThan(0.5)
  })
})
