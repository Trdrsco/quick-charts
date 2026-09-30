// @vitest-environment happy-dom
// The undo history as a model: a stack of readings, the word each step wears, the window that keeps
// an apply from filing itself, and the pointer sweep that catches a gesture no lane reports.
//
// No chart and no renderer. The plane is a function over a content reader and an apply, so
// everything that decides whether undo is correct (what counts as a change, what a step is called,
// how deep the stack goes, what an apply is allowed to do to it) is exercised against plain values.
// happy-dom is here for the sweep alone, which binds to a document root.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UTCTimestamp } from 'lightweight-charts'
import { DEFAULT_OPTIONS, DEFAULT_STYLE, type SerializedDrawing } from '../../src/internal/drawings/index'
import {
  attachHistoryPlane,
  diffLabel,
  sameValue,
  HISTORY_CHANGE_LABELS,
  HISTORY_LIMIT,
  HISTORY_SETTLE_PASSES,
  type HistoryChange,
  type HistoryPlane,
  type HistoryState,
} from '../../src/widget/history'
import type { ChartContent } from '../../src/widget/saveLoad'

const BASE: ChartContent = {
  symbol: 'ES',
  timeframe: '1m',
  style: 'candles',
  scale: 'normal',
  priceAxis: 'auto',
  indicators: [],
  appearance: {},
  compares: [],
  drawings: [],
  ext: {},
}

const content = (patch: Partial<ChartContent> = {}): ChartContent => ({ ...BASE, ...patch })
const state = (patch: Partial<ChartContent> = {}, drawings: readonly SerializedDrawing[] | null = null): HistoryState => ({ content: content(patch), drawings })
const drawing = (id: string, price = 2): SerializedDrawing => ({
  v: 2,
  id,
  type: 'trend-line',
  anchors: [{ time: 1 as UTCTimestamp, price }],
  style: { ...DEFAULT_STYLE },
  options: { ...DEFAULT_OPTIONS },
})
/** One macrotask, which is the grain a coalesced pass runs on. */
const macrotask = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

/** A plane over a mutable content value: the test moves the value, then fires the trigger, exactly
 *  as a chart lane would. */
function rig(options: { drawings?: boolean; enabled?: boolean } = {}) {
  let current = content()
  let held: readonly SerializedDrawing[] = []
  const applied: ChartContent[] = []
  const restored: (readonly SerializedDrawing[])[] = []
  let changes = 0
  let disposed = false
  const plane: HistoryPlane = attachHistoryPlane({
    enabled: options.enabled !== false,
    content: () => current,
    symbol: () => current.symbol,
    apply: (next) => {
      applied.push(next)
      current = next
    },
    drawings: options.drawings
      ? {
          snapshot: () => held,
          restore: (list) => {
            restored.push(list)
            held = list
          },
        }
      : null,
    disposed: () => disposed,
    pointerRoot: null,
    onChange: () => {
      changes += 1
    },
  })
  return {
    plane,
    applied,
    restored,
    changes: () => changes,
    set: (patch: Partial<ChartContent>) => {
      current = { ...current, ...patch }
    },
    setDrawings: (list: readonly SerializedDrawing[]) => {
      held = list
    },
    drawings: () => held,
    read: () => current,
    dispose: () => {
      disposed = true
    },
    /** Fire the trigger and let its coalesced pass run. */
    tick: async (): Promise<void> => {
      plane.changed()
      await macrotask()
    },
  }
}

describe('what a step is called', () => {
  it('names nothing when the two readings say the same thing', () => {
    expect(diffLabel(state(), state())).toBeNull()
    // Extension state is not a rung: nothing announces it and a reading does not put it back.
    expect(diffLabel(state({ ext: { a: 1 } }), state({ ext: { b: 2 } }))).toBeNull()
    // Key order is not a change either.
    expect(diffLabel(state({ appearance: { background: '#111', grid: true } }), state({ appearance: { grid: true, background: '#111' } }))).toBeNull()
  })

  it('names the change by the first rung it reaches, so two at once read as the higher one', () => {
    const table: { from: Partial<ChartContent>; to: Partial<ChartContent>; label: HistoryChange }[] = [
      // Everything below the symbol moves with it, and the step is still a symbol change.
      { from: {}, to: { symbol: 'NQ', timeframe: '5m', style: 'line', scale: 'log', appearance: { grid: false } }, label: 'symbol' },
      { from: {}, to: { timeframe: '5m', style: 'line', priceAxis: 'manual' }, label: 'timeframe' },
      { from: {}, to: { style: 'bars', scale: 'log' }, label: 'style' },
      { from: {}, to: { scale: 'log' }, label: 'priceScale' },
      // The scale mode and the framing policy are one word: both are how the price axis is read.
      { from: {}, to: { priceAxis: 'manual', appearance: { grid: false } }, label: 'priceScale' },
      { from: {}, to: { appearance: { grid: false } }, label: 'appearance' },
      { from: {}, to: { compares: [{ symbol: 'NQ' }] }, label: 'compareAdd' },
      { from: { compares: [{ symbol: 'NQ' }] }, to: { compares: [] }, label: 'compareRemove' },
      { from: { compares: [{ symbol: 'NQ', visible: true }] }, to: { compares: [{ symbol: 'NQ', visible: false }] }, label: 'compareChange' },
      { from: {}, to: { indicators: [{ id: 'a', definition: 'sma' }] }, label: 'indicatorAdd' },
      { from: { indicators: [{ id: 'a', definition: 'sma' }] }, to: { indicators: [] }, label: 'indicatorRemove' },
      { from: { indicators: [{ id: 'a', definition: 'sma', inputs: { length: 9 } }] }, to: { indicators: [{ id: 'a', definition: 'sma', inputs: { length: 21 } }] }, label: 'indicatorChange' },
      { from: {}, to: { drawings: [drawing('d1')] }, label: 'drawingAdd' },
      { from: { drawings: [drawing('d1')] }, to: { drawings: [] }, label: 'drawingRemove' },
      { from: { drawings: [drawing('d1')] }, to: { drawings: [drawing('d1', 9)] }, label: 'drawingChange' },
    ]
    for (const row of table) expect(diffLabel(state(row.from), state(row.to)), row.label).toBe(row.label)
  })

  it('reads separate-mode drawings from the reading that carries them', () => {
    expect(diffLabel(state({}, []), state({}, [drawing('d1')]))).toBe('drawingAdd')
    expect(diffLabel(state({}, [drawing('d1')]), state({}, []))).toBe('drawingRemove')
    expect(diffLabel(state({}, [drawing('d1')]), state({}, [drawing('d1', 9)]))).toBe('drawingChange')
  })

  it('gives every change a catalog key of its own', () => {
    const keys = Object.values(HISTORY_CHANGE_LABELS)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of keys) expect(key.startsWith('history.change')).toBe(true)
  })

  it('compares values without giving key order or a missing key meaning', () => {
    expect(sameValue({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
    expect(sameValue({ a: undefined }, {})).toBe(true)
    expect(sameValue([1, 2], [2, 1])).toBe(false)
    expect(sameValue({ a: { b: [1] } }, { a: { b: [1] } })).toBe(true)
    expect(sameValue({ a: 1 }, { a: '1' })).toBe(false)
  })
})

describe('the stacks', () => {
  let r: ReturnType<typeof rig>
  beforeEach(() => {
    r = rig()
    r.plane.seed()
  })

  it('files nothing until the reading moves, and nothing at all with the feature off', async () => {
    await r.tick()
    expect(r.plane.api.canUndo()).toBe(false)
    const off = rig({ enabled: false })
    off.plane.seed()
    off.set({ symbol: 'NQ' })
    await off.tick()
    expect([off.plane.api.canUndo(), off.plane.api.canRedo()]).toEqual([false, false])
    off.plane.api.undo()
    expect(off.applied).toEqual([])
  })

  it('files one step per change, and reports the word on top of the stack', async () => {
    r.set({ symbol: 'NQ' })
    await r.tick()
    expect(r.plane.api.canUndo()).toBe(true)
    expect(r.plane.api.undoChange()).toBe('symbol')
    expect(r.plane.api.canRedo()).toBe(false)
    expect(r.plane.api.redoChange()).toBeNull()
  })

  it('files one step for a burst that moves several fields, not one per field', async () => {
    r.plane.changed()
    r.set({ style: 'line' })
    r.plane.changed()
    r.set({ scale: 'log' })
    r.plane.changed()
    await macrotask()
    expect(r.plane.api.canUndo()).toBe(true)
    expect(r.plane.api.undoChange()).toBe('style')
    r.plane.api.undo()
    expect(r.plane.api.canUndo()).toBe(false)
  })

  it('takes a reading back whole and puts it back whole', async () => {
    const first = r.read()
    r.set({ symbol: 'NQ', timeframe: '5m', indicators: [{ id: 'a', definition: 'sma' }] })
    await r.tick()
    const second = r.read()

    r.plane.api.undo()
    expect(r.applied.at(-1)).toEqual(first)
    expect(r.plane.api.canUndo()).toBe(false)
    // The step's own word travels with it, so what would put it back names the same thing.
    expect(r.plane.api.redoChange()).toBe('symbol')

    await r.tick()
    r.plane.api.redo()
    expect(r.applied.at(-1)).toEqual(second)
    expect(r.plane.api.undoChange()).toBe('symbol')
    expect(r.plane.api.canRedo()).toBe(false)
  })

  it('does nothing on an empty stack, from either end', () => {
    r.plane.api.undo()
    r.plane.api.redo()
    expect(r.applied).toEqual([])
  })

  it('drops the oldest step past the cap rather than the newest', async () => {
    for (let step = 1; step <= HISTORY_LIMIT + 5; step++) {
      r.set({ symbol: `S${step}` })
      await r.tick()
    }
    // Walk the whole stack down. The deepest reading left is the one filed after the five that fell
    // off the far end, never the seed the chart opened on.
    let deepest = r.read()
    while (r.plane.api.canUndo()) {
      r.plane.api.undo()
      deepest = r.applied.at(-1)!
      await r.tick()
    }
    expect(r.applied).toHaveLength(HISTORY_LIMIT)
    expect(deepest.symbol).toBe('S5')
  })

  it('clears what was undone as soon as a new change is filed', async () => {
    for (const symbol of ['A', 'B', 'C']) {
      r.set({ symbol })
      await r.tick()
    }
    r.plane.api.undo()
    await r.tick()
    r.plane.api.undo()
    await r.tick()
    expect(r.plane.api.canRedo()).toBe(true)

    r.set({ style: 'line' })
    await r.tick()
    expect(r.plane.api.canRedo()).toBe(false)
    expect(r.plane.api.redoChange()).toBeNull()
    expect(r.plane.api.undoChange()).toBe('style')
  })

  it('reports every move of either stack, so a control can follow it', async () => {
    const before = r.changes()
    r.set({ symbol: 'NQ' })
    await r.tick()
    expect(r.changes()).toBeGreaterThan(before)
    const filed = r.changes()
    r.plane.api.undo()
    expect(r.changes()).toBeGreaterThan(filed)
  })
})

describe('the settling window', () => {
  it('files nothing for the apply it made, and closes as soon as the reading matches', async () => {
    const r = rig()
    r.plane.seed()
    r.set({ symbol: 'NQ' })
    await r.tick()
    expect(r.plane.api.canUndo()).toBe(true)

    r.plane.api.undo()
    // Every lane the apply re-entered fires; not one of them files a step.
    for (let pass = 0; pass < HISTORY_SETTLE_PASSES + 2; pass++) await r.tick()
    expect(r.plane.api.canUndo()).toBe(false)
    expect(r.plane.api.canRedo()).toBe(true)
    expect(r.applied).toHaveLength(1)

    // The window is shut, so an ordinary change after it is filed again.
    r.set({ style: 'line' })
    await r.tick()
    expect(r.plane.api.undoChange()).toBe('style')
  })

  it('releases a window that never converges, after its passes and no sooner', async () => {
    let current = content()
    const applied: ChartContent[] = []
    let reports = 0
    const plane = attachHistoryPlane({
      enabled: true,
      content: () => current,
      symbol: () => current.symbol,
      // An apply whose own policy settles somewhere else: the scale it was asked for never sticks,
      // so the reading can never match what was applied.
      apply: (next) => {
        applied.push(next)
        current = { ...next, scale: 'percent' }
      },
      drawings: null,
      disposed: () => false,
      pointerRoot: null,
      onChange: () => {
        reports += 1
      },
    })
    plane.seed()
    current = { ...current, symbol: 'NQ' }
    plane.changed()
    await macrotask()
    expect(plane.api.canUndo()).toBe(true)
    const filed = reports

    plane.api.undo()
    // Inside the window: the reading never matches, and nothing is filed for any of its passes.
    for (let pass = 0; pass < HISTORY_SETTLE_PASSES; pass++) {
      plane.changed()
      await macrotask()
      expect(plane.api.canUndo(), `pass ${pass}`).toBe(false)
    }
    // The window is out of passes, so a change made after it lands on the stack like any other.
    current = { ...current, style: 'line' }
    plane.changed()
    await macrotask()
    expect(plane.api.canUndo()).toBe(true)
    expect(plane.api.undoChange()).toBe('style')
    expect(reports).toBeGreaterThan(filed)
    plane.destroy()
  })
})

describe('separate-mode drawings, which the content does not carry', () => {
  it('puts them back once the symbol they were drawn on is the symbol on screen, and only once', async () => {
    const r = rig({ drawings: true })
    r.setDrawings([drawing('d1')])
    r.plane.seed()
    // A symbol change that also clears the drawings: the layer loaded the new symbol's own.
    r.set({ symbol: 'NQ' })
    r.setDrawings([])
    await r.tick()
    expect(r.plane.api.undoChange()).toBe('symbol')

    r.plane.api.undo()
    // The apply put the old symbol back, so the drawings that belong to it went back with it.
    expect(r.read().symbol).toBe('ES')
    expect(r.restored).toEqual([[drawing('d1')]])
    for (let pass = 0; pass < HISTORY_SETTLE_PASSES + 2; pass++) await r.tick()
    // Once. A settling pass does not write them a second time.
    expect(r.restored).toHaveLength(1)
    expect(r.drawings()).toEqual([drawing('d1')])
  })

  it('waits for the symbol rather than writing a reading into the wrong market', async () => {
    let current = content()
    let held: readonly SerializedDrawing[] = [drawing('d1')]
    const restored: (readonly SerializedDrawing[])[] = []
    // An apply whose symbol change lands a tick later, as a load does.
    const plane = attachHistoryPlane({
      enabled: true,
      content: () => current,
      symbol: () => current.symbol,
      apply: (next) => {
        const landing = next.symbol
        current = { ...next, symbol: current.symbol }
        setTimeout(() => {
          current = { ...current, symbol: landing }
        }, 0)
      },
      drawings: {
        snapshot: () => held,
        restore: (list) => {
          restored.push(list)
          held = list
        },
      },
      disposed: () => false,
      pointerRoot: null,
      onChange: () => undefined,
    })
    plane.seed()
    current = { ...current, symbol: 'NQ' }
    held = []
    plane.changed()
    await macrotask()

    plane.api.undo()
    expect(restored, 'the symbol has not landed yet').toEqual([])
    await macrotask()
    plane.changed()
    await macrotask()
    expect(restored).toEqual([[drawing('d1')]])
    plane.destroy()
  })
})

describe('the pointer sweep and disposal', () => {
  it('reads a press that ends anywhere, in the capture phase, and takes both listeners off', async () => {
    const root = document.documentElement
    const add = vi.spyOn(root, 'addEventListener')
    const remove = vi.spyOn(root, 'removeEventListener')
    try {
      let current = content()
      const applied: ChartContent[] = []
      const plane = attachHistoryPlane({
        enabled: true,
        content: () => current,
        symbol: () => current.symbol,
        apply: (next) => applied.push(next),
        drawings: null,
        disposed: () => false,
        pointerRoot: root,
        onChange: () => undefined,
      })
      const installed = add.mock.calls.filter(([type]) => type === 'pointerup' || type === 'dblclick')
      expect(installed.map(([type]) => type)).toEqual(['pointerup', 'dblclick'])
      // Capture, because a surface inside the chart may stop a press from bubbling.
      for (const [, , options] of installed) expect(options).toMatchObject({ capture: true })

      plane.seed()
      // The framing policy has no lane of its own: a press is the only thing that reports it.
      current = { ...current, priceAxis: 'manual' }
      root.dispatchEvent(new Event('pointerup'))
      await macrotask()
      expect(plane.api.undoChange()).toBe('priceScale')

      plane.destroy()
      for (const [type, listener] of installed) expect(remove).toHaveBeenCalledWith(type, listener, true)
      // A press after the teardown reaches nothing.
      current = { ...current, style: 'line' }
      root.dispatchEvent(new Event('pointerup'))
      await macrotask()
      expect(plane.api.canUndo()).toBe(false)
    } finally {
      add.mockRestore()
      remove.mockRestore()
    }
  })

  it('cannot record or move after its own destruction, or after the chart is gone', async () => {
    const r = rig()
    r.plane.seed()
    r.set({ symbol: 'NQ' })
    await r.tick()
    r.plane.destroy()
    expect([r.plane.api.canUndo(), r.plane.api.canRedo()]).toEqual([false, false])
    r.plane.api.undo()
    r.set({ style: 'line' })
    await r.tick()
    expect(r.applied).toEqual([])

    const gone = rig()
    gone.plane.seed()
    gone.dispose()
    gone.set({ symbol: 'NQ' })
    await gone.tick()
    expect(gone.plane.api.canUndo()).toBe(false)
  })
})
