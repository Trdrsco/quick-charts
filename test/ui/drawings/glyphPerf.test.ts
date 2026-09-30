// @vitest-environment happy-dom
// What the glyph picker costs to open. The grid is built once and kept: a later open, a category
// jump and a switch back to a set already mounted reuse the cells they already have, and the
// opening frame mounts a bounded number of them with the rest arriving a budget per frame. The
// counter here is the document's own createElement, so the measure is the real node cost rather
// than a claim about it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createChartI18n } from '../../../src/i18n'
import { EMOJI_CATEGORIES, ICON_CATEGORIES } from '../../../src/drawings/glyphs'
import { CELL_BUDGET, mountGlyphPicker } from '../../../src/ui/drawings/glyphPicker'

const t = createChartI18n().t
const GATES = { idBase: 'c1-glyphs', available: () => true, toolAllowed: () => true }

/** Every element the document builds while `run` executes. */
const pendingFrames = new Map<number, FrameRequestCallback>()
let nextFrameId = 0
let built = 0
let realCreate: typeof document.createElement
beforeEach(() => {
  pendingFrames.clear()
  nextFrameId = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = ++nextFrameId
    pendingFrames.set(id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => pendingFrames.delete(id))
  realCreate = document.createElement.bind(document)
  document.createElement = ((tag: string) => {
    built += 1
    return realCreate(tag)
  }) as typeof document.createElement
  built = 0
})
afterEach(() => {
  vi.unstubAllGlobals()
  pendingFrames.clear()
  document.createElement = realCreate
  document.body.replaceChildren()
})

/** One animation frame: the picker's own ramp step. */
const frame = async (): Promise<void> => {
  // A timer turn can contain multiple animation frames in happy-dom under load.
  // Advance one captured frame batch; callbacks scheduled by it belong to the next frame.
  const batch = [...pendingFrames.values()]
  pendingFrames.clear()
  for (const callback of batch) callback(performance.now())
  await Promise.resolve()
}
const cells = (root: HTMLElement): number => root.querySelectorAll('.qc-drawing-glyph-cell').length
const totalOf = (list: readonly { glyphs: readonly string[] }[]): number => list.reduce((n, c) => n + c.glyphs.length, 0)

describe('the cost of opening the glyph picker', () => {
  it('mounts a bounded first frame and ramps to the whole set without rebuilding it', async () => {
    const picker = mountGlyphPicker({ t, recents: [], ...GATES, onPick: () => undefined })
    document.body.appendChild(picker.root)
    const firstFrame = cells(picker.root)
    expect(firstFrame).toBeGreaterThan(0)
    expect(firstFrame).toBeLessThanOrEqual(CELL_BUDGET)
    const total = totalOf(EMOJI_CATEGORIES)
    let previous = firstFrame
    for (let i = 0; i < Math.ceil(total / CELL_BUDGET) + 2; i += 1) {
      await frame()
      const now = cells(picker.root)
      // No frame in the ramp is longer than the opening one.
      expect(now - previous).toBeLessThanOrEqual(CELL_BUDGET)
      previous = now
    }
    expect(cells(picker.root)).toBe(total)
    // Every cell was built once: the ramp appends, it does not rebuild what it already mounted.
    // Rebuilding the mounted grid each step would cost the square of the set over the budget,
    // which for this set is more than nine times the cells it ends with.
    // Each bundled emoji adds one image node beside its button.
    expect(built).toBeLessThan(total * 2 + 200)
    picker.destroy()
  })

  it('reuses its cells on a reopen and on a return to a set it already mounted', async () => {
    const picker = mountGlyphPicker({ t, recents: [], ...GATES, onPick: () => undefined })
    document.body.appendChild(picker.root)
    const total = totalOf(EMOJI_CATEGORIES)
    for (let i = 0; i < Math.ceil(total / CELL_BUDGET) + 2; i += 1) await frame()
    const emoji = [...picker.root.querySelectorAll('.qc-drawing-glyph-cell')]
    // A close and a reopen: the same grid comes back.
    picker.root.remove()
    picker.refresh([])
    document.body.appendChild(picker.root)
    built = 0
    expect([...picker.root.querySelectorAll('.qc-drawing-glyph-cell')]).toEqual(emoji)
    expect(built).toBe(0)

    const icons = picker.root.querySelector<HTMLButtonElement>('#c1-glyphs-kind-icon')!
    icons.click()
    for (let i = 0; i < Math.ceil(totalOf(ICON_CATEGORIES) / CELL_BUDGET) + 2; i += 1) await frame()
    const iconCells = [...picker.root.querySelectorAll('.qc-drawing-glyph-cell')]
    expect(iconCells.length).toBe(totalOf(ICON_CATEGORIES))
    built = 0
    picker.root.querySelector<HTMLButtonElement>('#c1-glyphs-kind-emoji')!.click()
    expect([...picker.root.querySelectorAll('.qc-drawing-glyph-cell')]).toEqual(emoji)
    picker.root.querySelector<HTMLButtonElement>('#c1-glyphs-kind-icon')!.click()
    expect([...picker.root.querySelectorAll('.qc-drawing-glyph-cell')]).toEqual(iconCells)
    // The two switches rebuild only the category strip and the kind tabs; no cell is built again,
    // which the node-identity checks above prove and this bound keeps honest.
    expect(built).toBeLessThan(EMOJI_CATEGORIES[0]!.glyphs.length)
    picker.destroy()
  })

  it('builds nothing for the set that has no glyphs yet, and keeps the emoji grid behind it', async () => {
    const picker = mountGlyphPicker({ t, recents: [], ...GATES, onPick: () => undefined })
    document.body.appendChild(picker.root)
    const total = totalOf(EMOJI_CATEGORIES)
    for (let i = 0; i < Math.ceil(total / CELL_BUDGET) + 2; i += 1) await frame()
    const emoji = [...picker.root.querySelectorAll('.qc-drawing-glyph-cell')]
    built = 0
    picker.root.querySelector<HTMLButtonElement>('#c1-glyphs-kind-sticker')!.click()
    for (let i = 0; i < 4; i += 1) await frame()
    // Stickers have no set: the grid is hidden and no cell is built for it.
    expect(cells(picker.root)).toBe(0)
    expect(built).toBeLessThan(EMOJI_CATEGORIES[0]!.glyphs.length)
    picker.root.querySelector<HTMLButtonElement>('#c1-glyphs-kind-emoji')!.click()
    expect([...picker.root.querySelectorAll('.qc-drawing-glyph-cell')]).toEqual(emoji)
    picker.destroy()
  })

  it('releases its grid and its pending frame on disposal', async () => {
    const picker = mountGlyphPicker({ t, recents: ['🚀'], ...GATES, onPick: () => undefined })
    document.body.appendChild(picker.root)
    expect(cells(picker.root)).toBeGreaterThan(0)
    picker.destroy()
    expect(picker.root.isConnected).toBe(false)
    expect(cells(picker.root)).toBe(0)
    built = 0
    for (let i = 0; i < 4; i += 1) await frame()
    expect(built).toBe(0) // no frame outlives the picker
  })
})
