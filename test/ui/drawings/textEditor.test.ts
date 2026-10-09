// @vitest-environment happy-dom
// The text editors. Over a drawing that types its words on the chart, an invisible field laid
// exactly over the painted words takes the keys: it reports what it holds, follows the words as
// they move, blinks the caret, marks a composing run, commits on Escape, Ctrl+Enter, a chart press
// and a blur within the page, and opens the settings on a double-click that began with the click
// that opened it. Over any other drawing, a box opens where the session says in the session's
// type, commits on a chart press, on blur and on Ctrl+Enter, and cancels on Escape. Neither lets
// its keys reach the chart.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChartI18n } from '../../../src/i18n'
import type { TextDraft, TextEditFrame, TextEditSession, TextInlineEdit } from '../../../src/drawings'
import { CARET_BLINK_MS, mountTextEditor } from '../../../src/ui/drawings/textEditor'

const t = createChartI18n().t
const session = (over: Partial<TextEditSession> = {}): TextEditSession => ({ id: 'd1', x: 120, y: 80, value: 'Hello', fresh: false, color: 'rgb(1, 2, 3)', fontSize: 14, bold: true, italic: false, angle: 0.3, ...over })

function rig(over: Partial<TextEditSession> = {}) {
  const container = document.createElement('div')
  const gestures = document.createElement('div')
  document.body.append(gestures, container)
  const out: string[] = []
  const editor = mountTextEditor(session(over), { container, gestures, t, fontFamily: 'Inter, sans-serif', onCommit: (v) => out.push(`commit:${v}`), onCancel: () => out.push('cancel') })
  const area = container.querySelector('textarea')!
  return { container, gestures, out, editor, area }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('the box editor', () => {
  it('opens at the session point in the session style, focused and selected', () => {
    const { area } = rig()
    expect(area.value).toBe('Hello')
    expect(area.style.left).toBe('120px')
    expect(area.style.top).toBe('80px')
    expect(area.style.transform).toContain('rotate(0.3rad)')
    expect(area.style.font).toContain('600')
    expect(area.style.font).toContain('14px')
    expect(area.getAttribute('aria-label')).toBe('Drawing text')
    expect(area.placeholder).toBe('Text')
    expect(document.activeElement).toBe(area)
  })

  it('commits on Ctrl+Enter with the typed value and removes itself', () => {
    const { area, out, container } = rig()
    area.value = 'Breakout'
    area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))
    expect(out).toEqual(['commit:Breakout'])
    expect(container.querySelector('textarea')).toBeNull()
  })

  it('cancels on Escape and commits on a chart press or on blur, each exactly once', () => {
    const a = rig()
    a.area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(a.out).toEqual(['cancel'])
    a.area.dispatchEvent(new Event('blur'))
    expect(a.out).toEqual(['cancel'])
    const b = rig({ value: 'Two' })
    b.gestures.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(b.out).toEqual(['commit:Two'])
    b.gestures.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(b.out).toEqual(['commit:Two'])
  })

  it('keeps its keys and presses to itself, and destroy removes it without a commit', () => {
    const { area, container, editor, out } = rig()
    let reached = 0
    container.addEventListener('keydown', () => reached++)
    area.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    expect(reached).toBe(0)
    editor.destroy()
    expect(container.querySelector('textarea')).toBeNull()
    expect(out).toEqual([])
  })
})

/** Where the painted words stand: a 14px block at (102, 102), two lines, the widest 60px. */
const FRAME: TextEditFrame = { x: 102, y: 102, width: 60, lines: 2, lineHeight: 14, font: '14px Inter, sans-serif', align: 'left', wrapWidth: null, angle: 0 }

function inlineRig(options: { value?: string; frame?: TextEditFrame | null; doubleClick?: boolean; tab?: boolean } = {}) {
  const drafts: TextDraft[] = []
  const listeners = new Set<(frame: TextEditFrame | null) => void>()
  let doubleClicks = 0
  const tabs: boolean[] = []
  let finished = 0
  const inline: TextInlineEdit = {
    frame: () => (options.frame === undefined ? FRAME : options.frame),
    onFrame: (listener) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    update: (draft) => drafts.push(draft),
    doubleClick: () => {
      doubleClicks++
      return options.doubleClick ?? true
    },
    tab: (backward) => {
      tabs.push(backward)
      return options.tab ?? false
    },
    finished: () => void finished++,
  }
  const r = rig({ value: options.value ?? 'Hi\nthere', inline })
  return { ...r, drafts, last: () => drafts[drafts.length - 1]!, move: (frame: TextEditFrame | null) => listeners.forEach((l) => l(frame)), listeners, doubleClicks: () => doubleClicks, tabs, finished: () => finished }
}

describe('the inline field over words the chart paints', () => {
  it('is a named field nobody sees, laid exactly over the painted words, focused with the caret after them', () => {
    const { area } = inlineRig()
    expect(area.dataset.qcEditor).toBe('inline')
    expect(area.getAttribute('aria-label')).toBe('Drawing text')
    expect(area.placeholder).toBe('Add text')
    expect(area.getAttribute('dir')).toBe('ltr')
    expect(area.getAttribute('spellcheck')).toBe('false')
    expect(document.activeElement).toBe(area)
    expect([area.selectionStart, area.selectionEnd]).toEqual([8, 8])
    // Its content box is the words' block: 2px of padding around it, one line to each 14px, and a
    // font size of room past the widest line for the caret.
    expect([area.style.left, area.style.top, area.style.width, area.style.height]).toEqual(['100px', '100px', '78px', '32px'])
    expect([area.style.lineHeight, area.style.whiteSpace, area.style.textAlign]).toEqual(['14px', 'pre', 'left'])
    expect(area.style.font).toContain('14px')
  })

  it('follows the words as a repaint moves them, and keeps its place while they are off the pane', () => {
    const { area, move } = inlineRig()
    move({ ...FRAME, x: 90, y: 101, lines: 3 })
    expect([area.style.left, area.style.top, area.style.height]).toEqual(['88px', '99px', '46px'])
    move(null)
    expect([area.style.left, area.style.top]).toEqual(['88px', '99px'])
  })

  it('wraps where the words wrap and centers where they center', () => {
    const wrapped = inlineRig({ frame: { ...FRAME, wrapWidth: 200 } })
    expect([wrapped.area.style.width, wrapped.area.style.whiteSpace, wrapped.area.wrap]).toEqual(['204px', 'pre-wrap', 'soft'])
    document.body.replaceChildren()
    const centered = inlineRig({ frame: { ...FRAME, align: 'center' } })
    // The room for the caret is shared out on both sides, so the field's center is the words'.
    expect([centered.area.style.left, centered.area.style.width, centered.area.style.textAlign]).toEqual(['93px', '78px', 'center'])
  })

  it('reports what it holds on every change: the words, the selection and a lit caret', () => {
    const { area, last } = inlineRig()
    expect(last()).toEqual({ value: 'Hi\nthere', selectionStart: 8, selectionEnd: 8, composition: null, caret: true })
    area.value = 'Hi\nthere!'
    area.setSelectionRange(3, 9)
    area.dispatchEvent(new Event('input'))
    expect(last()).toEqual({ value: 'Hi\nthere!', selectionStart: 3, selectionEnd: 9, composition: null, caret: true })
    area.setSelectionRange(0, 2)
    document.dispatchEvent(new Event('selectionchange'))
    expect([last().selectionStart, last().selectionEnd]).toEqual([0, 2])
  })

  it('blinks the caret, lit for half a second and dark for half, lighting it again on each change', () => {
    vi.useFakeTimers()
    try {
      const { area, last } = inlineRig()
      expect(CARET_BLINK_MS).toBe(500)
      vi.advanceTimersByTime(CARET_BLINK_MS)
      expect(last().caret).toBe(false)
      vi.advanceTimersByTime(CARET_BLINK_MS)
      expect(last().caret).toBe(true)
      vi.advanceTimersByTime(CARET_BLINK_MS)
      expect(last().caret).toBe(false)
      area.dispatchEvent(new Event('input'))
      expect(last().caret).toBe(true)
      vi.advanceTimersByTime(CARET_BLINK_MS - 1)
      expect(last().caret).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('holds the caret still where the viewer asks for reduced motion', () => {
    vi.useFakeTimers()
    const before = window.matchMedia
    window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query }) as MediaQueryList) as typeof window.matchMedia
    try {
      const { drafts } = inlineRig()
      const count = drafts.length
      vi.advanceTimersByTime(CARET_BLINK_MS * 4)
      expect(drafts.length).toBe(count)
    } finally {
      window.matchMedia = before
      vi.useRealTimers()
    }
  })

  it('marks the run an input method composes until the method ends it', () => {
    const { area, last } = inlineRig({ value: 'Hi' })
    area.dispatchEvent(new Event('compositionstart'))
    area.dispatchEvent(new CompositionEvent('compositionupdate', { data: 'ka' }))
    area.value = 'Hika'
    area.setSelectionRange(4, 4)
    area.dispatchEvent(new Event('input'))
    expect(last().composition).toEqual({ start: 2, end: 4 })
    area.dispatchEvent(new Event('compositionend'))
    expect(last().composition).toBeNull()
  })

  it('breaks the line on Enter, commits the words as typed on Escape and on Ctrl+Enter, and lets no key reach the chart', () => {
    const { area, container, out } = inlineRig()
    let reached = 0
    container.addEventListener('keydown', () => reached++)
    area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }))
    expect(out).toEqual([])
    area.value = 'Hi\nthere\n'
    area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(out).toEqual(['commit:Hi\nthere\n'])
    expect(reached).toBe(0)
    document.body.replaceChildren()
    const again = inlineRig()
    again.area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }))
    expect(again.out).toEqual(['commit:Hi\nthere'])
  })

  it('tells the edit it is finished before Escape commits, so nothing stays marked as typed in', () => {
    const { area, out, finished } = inlineRig()
    area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect([finished(), out]).toEqual([1, ['commit:Hi\nthere']])
  })

  it('hands Tab and Shift with Tab to the edit, keeping the key where the edit moved on', () => {
    const moved = inlineRig({ tab: true })
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    moved.area.dispatchEvent(tab)
    const back = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
    moved.area.dispatchEvent(back)
    expect([moved.tabs, tab.defaultPrevented, back.defaultPrevented]).toEqual([[false, true], true, true])
    document.body.replaceChildren()
    const kept = inlineRig({ tab: false })
    const plain = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    kept.area.dispatchEvent(plain)
    expect([kept.tabs, plain.defaultPrevented]).toEqual([[false], false])
  })

  it('leaves a key an input method is composing with to the method', () => {
    const { area, out } = inlineRig()
    area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true }))
    expect(out).toEqual([])
  })

  it('commits once on a chart press and on a blur within the page, and waits out the window losing the focus', () => {
    const a = inlineRig()
    a.gestures.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    a.gestures.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(a.out).toEqual(['commit:Hi\nthere'])
    document.body.replaceChildren()
    const b = inlineRig()
    const hasFocus = document.hasFocus
    document.hasFocus = () => false
    try {
      b.area.dispatchEvent(new Event('blur'))
      expect(b.out).toEqual([])
      expect(b.last().caret).toBe(false)
    } finally {
      document.hasFocus = hasFocus
    }
    b.area.dispatchEvent(new Event('blur'))
    expect(b.out).toEqual(['commit:Hi\nthere'])
  })

  it('asks for the settings on a double-click whose first click opened the edit, and leaves one of its own to the field', () => {
    const a = inlineRig()
    a.area.dispatchEvent(new MouseEvent('mousedown', { detail: 2, bubbles: true }))
    a.area.dispatchEvent(new MouseEvent('dblclick', { detail: 2, bubbles: true }))
    expect(a.doubleClicks()).toBe(1)
    document.body.replaceChildren()
    const b = inlineRig()
    b.area.dispatchEvent(new MouseEvent('mousedown', { detail: 1, bubbles: true }))
    b.area.dispatchEvent(new MouseEvent('mousedown', { detail: 2, bubbles: true }))
    b.area.dispatchEvent(new MouseEvent('dblclick', { detail: 2, bubbles: true }))
    expect(b.doubleClicks()).toBe(0)
  })

  it('goes on destroy without a commit, stops following the words and hands the keys back to the chart', () => {
    const { area, container, editor, gestures, out, listeners } = inlineRig()
    gestures.tabIndex = -1
    expect(document.activeElement).toBe(area)
    editor.destroy()
    expect(container.querySelector('textarea')).toBeNull()
    expect(out).toEqual([])
    expect(listeners.size).toBe(0)
    expect(document.activeElement).toBe(gestures)
  })
})
