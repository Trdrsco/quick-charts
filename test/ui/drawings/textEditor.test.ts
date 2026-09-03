// @vitest-environment happy-dom
// The inline text editor: it opens where the session says in the session's type, commits on a
// chart press, on blur and on Ctrl+Enter, cancels on Escape, and never lets its keys reach the
// chart.
import { afterEach, describe, expect, it } from 'vitest'
import { createChartI18n } from '../../../src/i18n'
import type { TextEditSession } from '../../../src/drawings'
import { mountTextEditor } from '../../../src/ui/drawings/textEditor'

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

describe('the inline text editor', () => {
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
