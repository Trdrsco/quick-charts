// @vitest-environment happy-dom
// The modal motion's timing in the chrome: every dialog keeps its closing pixels for exactly the
// duration role the stylesheet's transition reads, a host's palette retunes both at once, and a
// duration of zero (what the stylesheet resolves every duration to under a reduced-motion
// preference) closes at once. The motion is the dialog primitive's own behavior, so every surface
// that opens a modal dialog opens and closes with it, except the drawing settings, which edit the
// drawing they stand over and so open in place: at once, over an undimmed chart. Nothing in the
// chrome carries a duration of its own.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDialog } from '../../src/ui/chrome/dialog'
import { EXIT_EVENT_GRACE_MS } from '../../src/ui/chrome/motion'
import { createThemeController } from '../../src/theme/controller'
import { paintThemeRoot } from '../../src/widget/theme'
import { closeOverlays, refreshOverlays } from '../../src/ui/controls/overlays'
import { openIndicatorPicker } from '../../src/ui/chrome/indicatorPicker'
import { openIndicatorSettings } from '../../src/ui/chrome/indicatorSettings'
import { mountLayoutDialogs } from '../../src/ui/chrome/layoutDialogs'
import { createLayoutCatalog } from '../../src/ui/chrome/layoutCatalog'
import { createLayoutListStore } from '../../src/ui/chrome/preferences'
import { openConfirmDialog, openNameDialog } from '../../src/ui/chrome/prompt'
import { openDatePicker } from '../../src/ui/chrome/datePicker'
import { openImagePicker } from '../../src/ui/drawings/imagePicker'
import { openSettingsDialog } from '../../src/ui/drawings/settingsDialog'
import { openTemplateDeleteDialog, openTemplateNameDialog } from '../../src/ui/drawings/templateDialog'
import { createPresets } from '../../src/drawings/layer/presets'
import { drawingTools, type DrawingAssetPort } from '../../src/drawings/index'
import { BUILT_IN_INDICATORS } from '../../src/builtInIndicators'
import { memorySaveLoadAdapter } from '../../src/resources'
import { createChartI18n } from '../../src/i18n'
import type { SemanticTheme } from '../../src/theme/schema'
import { DIALOG_EXIT_MS, fakeWidget } from './harness'
import { ownIcons } from '../ownIcons'

const cleanup: (() => void)[] = []
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  for (const fn of cleanup.splice(0)) fn()
  vi.useRealTimers()
  document.body.replaceChildren()
})

const t = createChartI18n().t

function themed(custom: Partial<SemanticTheme> = {}): HTMLElement {
  const theme = createThemeController({ mode: 'dark', custom: { dark: custom } })
  const element = document.body.appendChild(document.createElement('div'))
  paintThemeRoot(element, theme.mode(), theme.get())
  return element
}

function open(at: HTMLElement, extra: { refresh?(): void } = {}) {
  const trigger = document.body.appendChild(document.createElement('button'))
  trigger.focus()
  const closed: true[] = []
  const dialog = openDialog({
    host: at,
    label: 'Probe',
    build(body) {
      body.appendChild(document.createElement('input'))
    },
    onClose: () => closed.push(true),
    ...extra,
  })
  const scrim = at.querySelector<HTMLElement>('.qc-dialog-scrim')!
  return { dialog, scrim, closed, trigger }
}

/** A real Escape press, where the keyboard is. */
function escape(): void {
  ;(document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
}

/** Every data-state the scrim moves through while it is watched. */
function watchStates(scrim: HTMLElement): { stop(): (string | null)[] } {
  const states: (string | null)[] = []
  const observer = new MutationObserver((records) => {
    for (const record of records) states.push((record.target as HTMLElement).dataset.state ?? null)
  })
  observer.observe(scrim, { attributes: true, attributeFilter: ['data-state'] })
  return {
    stop() {
      for (const record of observer.takeRecords()) states.push((record.target as HTMLElement).dataset.state ?? null)
      observer.disconnect()
      return states
    },
  }
}

describe('the modal motion', () => {
  it('opens through the opening frame and stands open, with focus already inside', () => {
    const { scrim, dialog } = open(themed())
    expect(scrim.dataset.state).toBe('open')
    expect(dialog.element.contains(document.activeElement)).toBe(true)
  })

  it('keeps the closing box, inert, for the duration role, and returns focus at once', async () => {
    const { dialog, scrim, closed, trigger } = open(themed())
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
    const { dialog, scrim, closed } = open(themed())
    dialog.close()
    // A transition ending on something inside the box is not the box's own exit.
    dialog.element.firstElementChild!.dispatchEvent(new Event('transitionend', { bubbles: true }))
    expect(scrim.isConnected).toBe(true)
    dialog.element.dispatchEvent(new Event('transitionend'))
    expect(scrim.isConnected).toBe(false)
    expect(closed).toEqual([true])
  })

  it('waits as long as a host palette says, because the stylesheet reads the same role', async () => {
    const { dialog, scrim } = open(themed({ 'motion.durationBase': '0.4s' }))
    dialog.close()
    await vi.advanceTimersByTimeAsync(399)
    expect(scrim.isConnected).toBe(true)
    await vi.advanceTimersByTimeAsync(1 + EXIT_EVENT_GRACE_MS)
    expect(scrim.isConnected).toBe(false)
  })

  it('closes at once when the duration is zero, as it is under a reduced-motion preference', () => {
    const { dialog, scrim, closed } = open(themed({ 'motion.durationBase': '0ms' }))
    dialog.close()
    expect(scrim.isConnected).toBe(false)
    expect(closed).toEqual([true])
  })

  it('closes at once when asked to, and finishes an exit already in flight', () => {
    const first = open(themed())
    first.dialog.close({ animate: false })
    expect(first.scrim.isConnected).toBe(false)
    const second = open(themed())
    second.dialog.close()
    expect(second.scrim.dataset.state).toBe('closing')
    second.dialog.close({ animate: false })
    expect(second.scrim.isConnected).toBe(false)
    expect(second.closed).toEqual([true])
  })

  it('closes at once when its host is closed at teardown', () => {
    const host = themed()
    const { scrim, closed } = open(host)
    closeOverlays(host)
    expect(scrim.isConnected).toBe(false)
    expect(closed).toEqual([true])
  })

  it('re-reads in place without playing the entrance again', async () => {
    const host = themed()
    const refresh = vi.fn()
    const { scrim } = open(host, { refresh })
    const watch = watchStates(scrim)
    refreshOverlays([host])
    await vi.advanceTimersByTimeAsync(0)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(watch.stop()).toEqual([])
    expect(scrim.dataset.state).toBe('open')
  })

  it('closes at once outside any themed root, where no recipe runs', () => {
    const bare = document.body.appendChild(document.createElement('div'))
    const { dialog, scrim } = open(bare)
    dialog.close()
    expect(scrim.isConnected).toBe(false)
  })
})

/** One of the chrome's dialogs opened over a host: its box, and how a viewer closes it. */
interface Opened {
  box: HTMLElement
  close(): void
}

function widgetFor(): ReturnType<typeof fakeWidget> {
  const w = fakeWidget()
  cleanup.push(() => w.dispose())
  return w
}

function layoutDialogsIn(host: HTMLElement) {
  const w = widgetFor()
  const catalog = createLayoutCatalog({ store: memorySaveLoadAdapter().layouts, widget: w.widget })
  const dialogs = mountLayoutDialogs({ ...w.ctx, overlays: host, catalog, listing: createLayoutListStore(w.storage), notify: () => undefined })
  cleanup.push(() => {
    dialogs.destroy()
    catalog.destroy()
  })
  return dialogs
}

function boxIn(host: HTMLElement, role: string): HTMLElement {
  return host.querySelector<HTMLElement>(`[data-role="${role}"]`)!
}

const refusingPort: DrawingAssetPort = {
  intakeImage: async () => ({ ok: false, reason: { kind: 'unreadable' } }) as never,
  glyphSource: () => null,
}

function drawingSettingsIn(host: HTMLElement, onClose?: (outcome: 'commit' | 'cancel') => void) {
  const drawing = drawingTools.create('trend_line', 'd1', [{ time: 1000 as never, price: 100 }, { time: 1060 as never, price: 101 }])!
  return openSettingsDialog({ chrome: host, t, icons: ownIcons(), drawing, presets: createPresets(null), idBase: 'c1-drawing-settings', run: () => true, available: () => true, ...(onClose ? { onClose } : {}) })
}

const DIALOGS: readonly [string, (host: HTMLElement) => Opened][] = [
  ['the indicator browser', (host) => {
    const w = widgetFor()
    const dialog = openIndicatorPicker({ ...w.ctx, overlays: host })
    return { box: dialog.element, close: () => dialog.element.querySelector<HTMLButtonElement>('.qc-dialog-close')!.click() }
  }],
  ['the indicator settings', (host) => {
    const w = widgetFor()
    w.chart.handle.indicators.add({ id: 'bollinger-1', definition: BUILT_IN_INDICATORS.find((d) => d.id === 'bollinger')! })
    const dialog = openIndicatorSettings({ ...w.ctx, overlays: host, chart: w.chart.handle, instance: w.chart.state.indicators[0]! })
    return { box: dialog.element, close: () => dialog.element.querySelector<HTMLButtonElement>('.qc-dialog-actions button[aria-label="Cancel"]')!.click() }
  }],
  ['the saved-layouts browser', (host) => {
    layoutDialogsIn(host).openLayouts()
    const box = host.querySelector<HTMLElement>('.qc-layouts-dialog')!
    return { box, close: () => box.querySelector<HTMLButtonElement>('.qc-dialog-close')!.click() }
  }],
  ['the name prompt', (host) => {
    const dialog = openNameDialog({ host, t, icons: ownIcons(), title: 'Name', label: 'Name', verb: 'Save', commit: () => true })
    return { box: dialog.element, close: escape }
  }],
  ['the confirm prompt', (host) => {
    const dialog = openConfirmDialog({ host, t, icons: ownIcons(), title: 'Delete', body: 'Delete it?', verb: 'Delete', confirm: () => undefined })
    return { box: dialog.element, close: () => dialog.element.querySelector<HTMLButtonElement>('.qc-prompt-actions .qc-button--primary')!.click() }
  }],
  ['go to date', (host) => {
    const w = widgetFor()
    const dialog = openDatePicker({ host, i18n: w.i18n, icons: w.icons, minSec: 1_700_000_000, maxSec: 1_700_864_000, withTime: false, onSelect: () => undefined })
    return { box: dialog.element, close: escape }
  }],
  ['the drawing image picker', (host) => {
    const close = openImagePicker({ container: host, t, icons: ownIcons(), assets: refusingPort, canPlace: () => true, onConfirm: () => undefined })
    return { box: boxIn(host, 'drawing-image-picker'), close }
  }],
  ['the drawing template name prompt', (host) => {
    const close = openTemplateNameDialog({ container: host, t, icons: ownIcons() }, () => undefined)
    return { box: boxIn(host, 'drawing-template-name'), close }
  }],
  ['the drawing template delete confirm', (host) => {
    const close = openTemplateDeleteDialog({ container: host, t, icons: ownIcons() }, 'Thick red', () => undefined)
    return { box: boxIn(host, 'drawing-template-delete'), close }
  }],
]

describe('every modal dialog opens and closes with the modal motion', () => {
  for (const [name, openIt] of DIALOGS) {
    it(`${name} opens on the motion with focus inside, and leaves after the base duration`, async () => {
      const { box, close } = openIt(themed())
      const scrim = box.closest<HTMLElement>('.qc-dialog-scrim')!
      expect(scrim.dataset.state).toBe('open')
      expect(box.contains(document.activeElement)).toBe(true)
      close()
      expect(scrim.dataset.state).toBe('closing')
      expect(box.inert).toBe(true)
      await vi.advanceTimersByTimeAsync(149)
      expect(scrim.isConnected).toBe(true)
      await vi.advanceTimersByTimeAsync(1 + EXIT_EVENT_GRACE_MS)
      expect(scrim.isConnected).toBe(false)
    })

    it(`${name} closes at once under a reduced-motion preference`, () => {
      const { box, close } = openIt(themed({ 'motion.durationBase': '0ms' }))
      const scrim = box.closest<HTMLElement>('.qc-dialog-scrim')!
      expect(scrim.dataset.state).toBe('open')
      close()
      expect(scrim.isConnected).toBe(false)
    })
  }
})

describe('the drawing settings open in place', () => {
  it('appear at once over a backdrop that dims nothing, and leave at once', () => {
    const host = themed()
    const handle = drawingSettingsIn(host)
    const box = boxIn(host, 'drawing-settings')
    const scrim = box.closest<HTMLElement>('.qc-dialog-scrim')!
    expect(scrim.dataset.state).toBeUndefined()
    expect(scrim.dataset.qcVeil).toBe('none')
    expect(box.contains(document.activeElement)).toBe(true)
    handle.close()
    expect(scrim.isConnected).toBe(false)
  })

  it('still close on a press on the backdrop, and on Escape, at once', () => {
    const host = themed()
    const outcomes: string[] = []
    drawingSettingsIn(host, (outcome) => outcomes.push(outcome))
    const scrim = boxIn(host, 'drawing-settings').closest<HTMLElement>('.qc-dialog-scrim')!
    scrim.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(scrim.isConnected).toBe(false)
    expect(outcomes).toEqual(['cancel'])
    drawingSettingsIn(host, (outcome) => outcomes.push(outcome))
    const again = boxIn(host, 'drawing-settings').closest<HTMLElement>('.qc-dialog-scrim')!
    escape()
    expect(again.isConnected).toBe(false)
    expect(outcomes).toEqual(['cancel', 'cancel'])
  })
})

describe('a dialog over another', () => {
  it('a template name prompt over the drawing settings moves on its own and leaves first', async () => {
    const host = themed()
    const outcomes: string[] = []
    drawingSettingsIn(host, (outcome) => outcomes.push(outcome))
    const settings = boxIn(host, 'drawing-settings')
    const settingsScrim = settings.closest<HTMLElement>('.qc-dialog-scrim')!
    const opener = settings.querySelector<HTMLButtonElement>('.qc-drawing-template-button')!
    opener.focus()
    openTemplateNameDialog({ container: settings, t, icons: ownIcons() }, () => undefined)
    const prompt = boxIn(host, 'drawing-template-name')
    const promptScrim = prompt.closest<HTMLElement>('.qc-dialog-scrim')!
    expect(promptScrim).not.toBe(settingsScrim)
    expect(promptScrim.dataset.state).toBe('open')
    expect(promptScrim.dataset.qcVeil).toBeUndefined()
    expect(prompt.contains(document.activeElement)).toBe(true)

    // Escape answers the prompt alone: it leaves on the motion and gives focus back inside the
    // settings, which stay open and untouched.
    escape()
    expect(promptScrim.dataset.state).toBe('closing')
    expect(settingsScrim.isConnected).toBe(true)
    expect(document.activeElement).toBe(opener)
    await vi.advanceTimersByTimeAsync(DIALOG_EXIT_MS)
    expect(promptScrim.isConnected).toBe(false)
    expect(settingsScrim.isConnected).toBe(true)
    expect(outcomes).toEqual([])

    // The next Escape closes the settings, at once, ending their session.
    escape()
    expect(settingsScrim.isConnected).toBe(false)
    expect(outcomes).toEqual(['cancel'])
  })

  it('a confirm over the saved-layouts browser leaves first, and the browser stays', async () => {
    const host = themed()
    layoutDialogsIn(host).openLayouts()
    const browserScrim = host.querySelector<HTMLElement>('.qc-layouts-dialog')!.closest<HTMLElement>('.qc-dialog-scrim')!
    const confirm = openConfirmDialog({ host, t, icons: ownIcons(), title: 'Delete', body: 'Delete it?', verb: 'Delete', confirm: () => undefined })
    const confirmScrim = confirm.element.closest<HTMLElement>('.qc-dialog-scrim')!
    expect(confirmScrim.dataset.state).toBe('open')
    escape()
    expect(confirmScrim.dataset.state).toBe('closing')
    expect(browserScrim.dataset.state).toBe('open')
    await vi.advanceTimersByTimeAsync(DIALOG_EXIT_MS)
    expect(confirmScrim.isConnected).toBe(false)
    expect(browserScrim.isConnected).toBe(true)
  })

  it('what a dialog stood over takes it along at once, and focus goes back past both', () => {
    const host = themed()
    const trigger = document.body.appendChild(document.createElement('button'))
    trigger.focus()
    const handle = drawingSettingsIn(host)
    const settings = boxIn(host, 'drawing-settings')
    openTemplateNameDialog({ container: settings, t, icons: ownIcons() }, () => undefined)
    const promptScrim = boxIn(host, 'drawing-template-name').closest<HTMLElement>('.qc-dialog-scrim')!
    handle.close()
    expect(promptScrim.isConnected).toBe(false)
    expect(settings.isConnected).toBe(false)
    expect(document.activeElement).toBe(trigger)
  })

  it('a new name question replaces the standing one at once, and opens on the motion', () => {
    const host = themed()
    const dialogs = layoutDialogsIn(host)
    const question = { title: 'layouts.saveNewTitle', label: 'layouts.saveNewLabel', verb: 'layouts.save', commit: () => true } as const
    dialogs.askName(question)
    const first = host.querySelector<HTMLElement>('.qc-prompt')!.closest<HTMLElement>('.qc-dialog-scrim')!
    dialogs.askName(question)
    expect(first.isConnected).toBe(false)
    const prompts = host.querySelectorAll('.qc-prompt')
    expect(prompts).toHaveLength(1)
    expect(prompts[0]!.closest<HTMLElement>('.qc-dialog-scrim')!.dataset.state).toBe('open')
  })
})

describe('a dialog rebuilt in place', () => {
  it('the indicator browser relabels for a new language without playing the entrance again', async () => {
    const host = themed()
    const w = widgetFor()
    const dialog = openIndicatorPicker({ ...w.ctx, overlays: host })
    const scrim = dialog.element.closest<HTMLElement>('.qc-dialog-scrim')!
    const watch = watchStates(scrim)
    await w.i18n.setLocale('de')
    await vi.advanceTimersByTimeAsync(0)
    expect(w.i18n.locale()).toBe('de')
    expect(dialog.element.isConnected).toBe(true)
    expect(watch.stop()).toEqual([])
    expect(scrim.dataset.state).toBe('open')
    expect(host.querySelectorAll('.qc-dialog-scrim')).toHaveLength(1)
  })
})

describe('the chrome carries no duration of its own', () => {
  // Node's own file-URL conversion: happy-dom replaces the global URL with one that reads a file URL
  // differently.
  const ui = fileURLToPath(import.meta.url).replace(/\\/g, '/').replace(/\/test\/chrome\/[^/]+$/, '/src/ui/')
  const files = [
    'chrome/dialog.ts',
    'chrome/replayBar.ts',
    'chrome/searchDialog.ts',
    'chrome/settingsMenu.ts',
    'chrome/indicatorPicker.ts',
    'chrome/indicatorSettings.ts',
    'chrome/layoutDialogs.ts',
    'chrome/prompt.ts',
    'chrome/datePicker.ts',
    'drawings/dialog.ts',
    'drawings/imagePicker.ts',
    'drawings/settingsDialog.ts',
    'drawings/templateDialog.ts',
  ]
  for (const file of files) {
    it(`${file} waits on the motion role, never a literal, and never opts out of it`, () => {
      const source = readFileSync(`${ui}${file}`, 'utf8')
      expect(source).not.toMatch(/exitMs:/)
      expect(source).not.toMatch(/setTimeout\(\s*remove\s*,\s*\d/)
      expect(source).not.toMatch(/prefers-reduced-motion/)
      expect(source).not.toMatch(/\banimated\s*[:?]/)
    })
  }
})
