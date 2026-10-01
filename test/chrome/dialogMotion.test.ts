// @vitest-environment happy-dom
// The modal motion's timing in the chrome: an animated dialog keeps its closing pixels for exactly
// the duration role the stylesheet's transition reads, a host's palette retunes both at once, and a
// duration of zero (what the stylesheet resolves every duration to under a reduced-motion
// preference) closes at once. Nothing in the chrome carries a duration of its own.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDialog } from '../../src/ui/chrome/dialog'
import { EXIT_EVENT_GRACE_MS } from '../../src/ui/chrome/motion'
import { createThemeController } from '../../src/theme/controller'
import { paintThemeRoot } from '../../src/widget/theme'
import type { SemanticTheme } from '../../src/theme/schema'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  document.body.replaceChildren()
})

function host(custom: Partial<SemanticTheme> = {}): HTMLElement {
  const theme = createThemeController({ mode: 'dark', custom: { dark: custom } })
  const element = document.body.appendChild(document.createElement('div'))
  paintThemeRoot(element, theme.mode(), theme.get())
  return element
}

function open(at: HTMLElement, animated = true) {
  const trigger = document.body.appendChild(document.createElement('button'))
  trigger.focus()
  const closed: true[] = []
  const dialog = openDialog({
    host: at,
    label: 'Probe',
    animated,
    build(body) {
      body.appendChild(document.createElement('input'))
    },
    onClose: () => closed.push(true),
  })
  const scrim = at.querySelector<HTMLElement>('.qc-dialog-scrim')!
  return { dialog, scrim, closed, trigger }
}

describe('the modal motion', () => {
  it('opens through the opening frame and stands open', () => {
    const { scrim } = open(host())
    expect(scrim.dataset.state).toBe('open')
  })

  it('keeps the closing box, inert, for the duration role, and returns focus at once', async () => {
    const { dialog, scrim, closed, trigger } = open(host())
    dialog.close()
    expect(scrim.dataset.state).toBe('closing')
    expect(dialog.element.inert).toBe(true)
    expect(dialog.element.getAttribute('aria-hidden')).toBe('true')
    expect(scrim.style.pointerEvents).toBe('none')
    expect(document.activeElement).toBe(trigger)
    await vi.advanceTimersByTimeAsync(149)
    expect(scrim.isConnected).toBe(true)
    await vi.advanceTimersByTimeAsync(1 + EXIT_EVENT_GRACE_MS)
    expect(scrim.isConnected).toBe(false)
    expect(closed).toEqual([true])
  })

  it('finishes on the box transition ending, before the fallback timer', () => {
    const { dialog, scrim, closed } = open(host())
    dialog.close()
    // A transition ending on something inside the box is not the box's own exit.
    dialog.element.firstElementChild!.dispatchEvent(new Event('transitionend', { bubbles: true }))
    expect(scrim.isConnected).toBe(true)
    dialog.element.dispatchEvent(new Event('transitionend'))
    expect(scrim.isConnected).toBe(false)
    expect(closed).toEqual([true])
  })

  it('waits as long as a host palette says, because the stylesheet reads the same role', async () => {
    const { dialog, scrim } = open(host({ 'motion.durationBase': '0.4s' }))
    dialog.close()
    await vi.advanceTimersByTimeAsync(399)
    expect(scrim.isConnected).toBe(true)
    await vi.advanceTimersByTimeAsync(1 + EXIT_EVENT_GRACE_MS)
    expect(scrim.isConnected).toBe(false)
  })

  it('closes at once when the duration is zero, as it is under a reduced-motion preference', () => {
    const { dialog, scrim, closed } = open(host({ 'motion.durationBase': '0ms' }))
    dialog.close()
    expect(scrim.isConnected).toBe(false)
    expect(closed).toEqual([true])
  })

  it('closes at once when asked to, and when the dialog does not animate', () => {
    const first = open(host())
    first.dialog.close({ animate: false })
    expect(first.scrim.isConnected).toBe(false)
    const plain = open(host(), false)
    expect(plain.scrim.dataset.state).toBeUndefined()
    plain.dialog.close()
    expect(plain.scrim.isConnected).toBe(false)
  })

  it('closes at once outside any themed root, where no recipe runs', () => {
    const bare = document.body.appendChild(document.createElement('div'))
    const { dialog, scrim } = open(bare)
    dialog.close()
    expect(scrim.isConnected).toBe(false)
  })
})

describe('the chrome carries no duration of its own', () => {
  // Node's own file-URL conversion: happy-dom replaces the global URL with one that reads a file URL
  // differently.
  const chrome = fileURLToPath(import.meta.url).replace(/\\/g, '/').replace(/\/test\/chrome\/[^/]+$/, '/src/ui/chrome/')
  for (const file of ['dialog.ts', 'replayBar.ts', 'searchDialog.ts', 'settingsMenu.ts']) {
    it(`${file} waits on the motion role, never a literal`, () => {
      const source = readFileSync(`${chrome}${file}`, 'utf8')
      expect(source).not.toMatch(/exitMs:/)
      expect(source).not.toMatch(/setTimeout\(\s*remove\s*,\s*\d/)
      expect(source).not.toMatch(/prefers-reduced-motion/)
    })
  }
})
