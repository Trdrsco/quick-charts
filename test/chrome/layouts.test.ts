// @vitest-environment happy-dom
// The layout menus: the setup grid of 55 arrangements with radio semantics and the five sync
// switches, and the saved-layouts menu, whose every verb is a widget command (`widget.layout.*`)
// heard back through the `layout` and `saveConflict` events, so a policy that refuses layout
// writes disables every row and nothing reaches the store.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { arrangementGlyph, mountLayoutSetup } from '../../src/ui/chrome/layoutSetup'
import { mountLayoutsMenu, relativeTime } from '../../src/ui/chrome/layoutsMenu'
import { mountLayoutDialogs } from '../../src/ui/chrome/layoutDialogs'
import { createLayoutListStore } from '../../src/ui/chrome/preferences'
import { ARRANGEMENTS } from '../../src/layoutGrid'
import { memorySaveLoadAdapter, type LayoutBody, type LayoutMeta, type ResourceStore } from '../../src/resources'
import { openResourceController, ResourceRollbackError } from '../../src/openResource'
import { createChartI18n } from '../../src/i18n'
import type { LayoutModelState } from '../../src/widget/layout'
import { FLYOUT_WIDTH } from '../../src/ui/chrome/flyoutGeometry'
import { fakeWidget, pastDialogExit, press, settle, type FakeWidgetOptions } from './harness'
import { attachShortcuts } from '../../src/widget/shortcuts'
import { ownIcons } from '../ownIcons'

let cleanup: (() => void)[] = []
afterEach(() => {
  for (const fn of cleanup.splice(0)) fn()
  document.body.replaceChildren()
  vi.useRealTimers()
})

/** A clock the test runs past a dialog's exit motion, while promised outcomes still settle. */
const clockForDialogExits = (): void => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
}

describe('the layout setup menu', () => {
  it('draws a glyph for every arrangement from its own panes, one hollow a pane', () => {
    for (const a of ARRANGEMENTS) expect(arrangementGlyph(a.code, ownIcons()).querySelector('svg'), a.code).not.toBeNull()
    // Three panes over one and one over three are two drawings, neither of them a turned copy of the
    // other: the frame's outline and a hollow for each of the four panes.
    const hollows = (code: string): number => (arrangementGlyph(code, ownIcons()).querySelector('path')!.getAttribute('d')!.match(/M/g) ?? []).length
    expect(hollows('3-1')).toBe(5)
    expect(hollows('1-3')).toBe(5)
    expect(arrangementGlyph('3-1', ownIcons()).querySelector('svg')!.getAttribute('style')).toBeNull()
    expect(arrangementGlyph('3-1', ownIcons()).innerHTML).not.toBe(arrangementGlyph('1-3', ownIcons()).innerHTML)
    expect(arrangementGlyph('nope', ownIcons()).querySelector('svg')).toBeNull()
  })

  it('offers the 55 tiles as a radio group in 13 rows, checks the current one, and re-tiles through the command', () => {
    const w = fakeWidget()
    const setup = mountLayoutSetup(w.ctx)
    document.body.appendChild(setup.element)
    cleanup.push(() => (setup.destroy(), w.dispose()))
    expect(setup.element.getAttribute('aria-label')).toBe('Layout setup: Single chart')
    setup.element.click()
    const panel = w.overlays.querySelector<HTMLElement>('[role="dialog"]')!
    const tiles = [...panel.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
    expect(tiles.length).toBe(55)
    expect(panel.querySelectorAll('.qc-layout-row').length).toBe(13)
    expect(tiles.filter((t) => t.getAttribute('aria-checked') === 'true').map((t) => t.dataset.arrangement)).toEqual(['s'])
    expect(tiles[9]!.getAttribute('aria-label')).toBe('2 × 2 grid')
    tiles[9]!.click()
    expect(w.widgetCalls).toContain('arrangement:4')
    setup.sync()
    expect(setup.element.getAttribute('aria-label')).toBe('Layout setup: 2 × 2 grid')
  })

  it('projects committed state without losing the focused sync row or either narrow-flyout scroll axis', () => {
    const outside = document.body.appendChild(document.createElement('button'))
    let moveFocusOutside = false
    const w = fakeWidget({ chartCount: 2, access: { command: () => {
      if (moveFocusOutside) outside.focus()
      return true
    } } })
    w.commands.execute('widget.layout.setArrangement', '2h')
    const setup = mountLayoutSetup(w.ctx)
    document.body.appendChild(setup.element)
    cleanup.push(() => (setup.destroy(), w.dispose()))
    setup.element.click()
    const body = w.overlays.querySelector<HTMLElement>('.qc-menu-body')!
    body.scrollTop = 91
    body.scrollLeft = 37
    const focusedSwitch = w.overlays.querySelectorAll<HTMLButtonElement>('[role="switch"]')[2]!
    focusedSwitch.focus()
    const state: LayoutModelState = {
      arrangement: '2h', geometry: [{ x: 0, y: 0, w: 0.4, h: 1 }, { x: 0.4, y: 0, w: 0.6, h: 1 }],
      sync: { symbol: true, timeframe: false, crosshair: true, time: false, dateRange: true }, active: 1, maximized: 1,
    }
    setup.sync(state)
    expect(setup.element.getAttribute('aria-label')).toBe('Layout setup: 2 columns')
    expect(setup.element.title).toBe('Layout setup: 2 columns')
    expect(w.overlays.querySelector('[role="radio"][aria-checked="true"]')?.getAttribute('data-arrangement')).toBe('2h')
    expect([...w.overlays.querySelectorAll('[role="switch"]')].map((control) => control.getAttribute('aria-checked'))).toEqual(['true', 'false', 'true', 'false', 'true'])
    // Written in place: the focused switch is the same node, so its knob slides rather than being
    // replaced by one already at its end, and nothing had to be focused again.
    expect(w.overlays.querySelectorAll('[role="switch"]')[2]).toBe(focusedSwitch)
    expect(document.activeElement).toBe(focusedSwitch)
    expect(body.scrollTop).toBe(91)
    expect(body.scrollLeft).toBe(37)
    expect(w.overlays.querySelectorAll('.qc-layout-info')).toHaveLength(5)

    moveFocusOutside = true
    setup.sync({ ...state, arrangement: '3h' })
    expect(document.activeElement).toBe(outside)
  })

  it('builds the open menu again in a new language, keeping the reader\'s row and scroll', async () => {
    const w = fakeWidget({ chartCount: 2 })
    const setup = mountLayoutSetup(w.ctx)
    document.body.appendChild(setup.element)
    cleanup.push(() => (setup.destroy(), w.dispose()))
    setup.element.click()
    const body = w.overlays.querySelector<HTMLElement>('.qc-menu-body')!
    body.scrollTop = 64
    const before = w.overlays.querySelectorAll<HTMLButtonElement>('[role="switch"]')[1]!
    before.focus()
    await w.i18n.setLocale('de')
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    setup.sync()
    const after = w.overlays.querySelectorAll<HTMLButtonElement>('[role="switch"]')[1]!
    expect(after).not.toBe(before)
    expect(document.activeElement).toBe(after)
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    focus.mockRestore()
    expect(w.overlays.querySelector<HTMLElement>('.qc-menu-body')!.scrollTop).toBe(64)
  })

  it('the sync switches are live on a single chart, because a flag is a standing preference', () => {
    const w = fakeWidget()
    const setup = mountLayoutSetup(w.ctx)
    document.body.appendChild(setup.element)
    cleanup.push(() => (setup.destroy(), w.dispose()))
    setup.element.click()
    const switches = [...w.overlays.querySelectorAll<HTMLButtonElement>('[role="switch"]')]
    expect(switches.map((s) => s.getAttribute('aria-label'))).toEqual(['Sync symbol', 'Sync timeframe', 'Sync crosshair', 'Sync time', 'Sync date range'])
    // A sync flag says how the NEXT split behaves, so setting it while one chart is up is the whole
    // point of setting it. Gated on a split already existing, every switch would be dead in the
    // state a viewer is usually in, and the menu would offer five controls that do nothing.
    expect(switches.some((s) => s.disabled)).toBe(false)
    switches[1]!.click()
    expect(w.widgetCalls).toContain('sync:{"timeframe":true}')
    expect(w.widget.layout.sync().timeframe).toBe(true)
  })

  it('the sync switches stand down when the access policy refuses the command', () => {
    const w = fakeWidget({ access: { command: (id) => id !== 'widget.layout.setSync' } })
    const setup = mountLayoutSetup(w.ctx)
    document.body.appendChild(setup.element)
    cleanup.push(() => (setup.destroy(), w.dispose()))
    setup.element.click()
    const switches = [...w.overlays.querySelectorAll<HTMLButtonElement>('[role="switch"]')]
    expect(switches.every((s) => s.disabled)).toBe(true)
  })
})

function layoutStore(rows: LayoutMeta[] = []): ResourceStore<LayoutMeta, LayoutBody> & { rows: LayoutMeta[] } {
  const store = {
    rows,
    list: vi.fn(async () => store.rows),
    load: vi.fn(async (id: string) => ({ ref: { id, revision: '1' }, body: { name: `layout ${id}`, content: '{}' } })),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(async (ref: { id: string }) => {
      store.rows = store.rows.filter((r) => r.id !== ref.id)
      return { kind: 'ok' as const, ref: { id: ref.id, revision: '1' } }
    }),
  }
  return store
}

/** The saved layout over the REAL open-resource controller, with every write to the store recorded.
 *  What the chrome stands down for is then the state the controller actually holds, and "touches the
 *  store not at all" is a list a test can read rather than a claim. */
function realLayoutSaveLoad() {
  const i18n = createChartI18n()
  const base = memorySaveLoadAdapter().layouts
  const writes: string[] = []
  const store: ResourceStore<LayoutMeta, LayoutBody> = {
    ...base,
    create: (body, signal) => {
      writes.push(`create:${body.name}`)
      return base.create(body, signal)
    },
    update: (ref, body, signal) => {
      writes.push(`update:${body.name}`)
      return base.update(ref, body, signal)
    },
  }
  const controller = openResourceController<LayoutMeta, LayoutBody>({ store: () => store, t: () => i18n.t })
  return {
    store,
    writes,
    saveLoad: {
      current: () => controller.current(),
      notSaving: () => controller.notSaving(),
      detach: () => controller.detach(),
      save: (name: string, opts?: { asNew?: boolean; signal?: AbortSignal }) => controller.save({ name, content: '{}' }, opts),
      load: (id: string, signal?: AbortSignal) => controller.load(id, signal, () => undefined),
      remove: (signal?: AbortSignal) => controller.remove(signal),
    },
    /** Leave the layout holding neither content, through the door a failed rollback comes in by. */
    async couldNotBePutBack() {
      const row = await store.create({ name: 'Elsewhere', content: '{}' })
      if (row.kind !== 'ok') throw new Error('unreachable')
      writes.length = 0
      await controller.load(row.ref.id, undefined, () => {
        throw new ResourceRollbackError(new Error('half of it landed'), new Error('and the rest would not go back'))
      })
    },
  }
}

function mountLayouts(
  options: {
    store?: ReturnType<typeof layoutStore> | null
    access?: (id: string) => boolean
    notSaving?: boolean
    layoutSaveLoad?: FakeWidgetOptions['layoutSaveLoad']
  } = {},
) {
  const store = options.store === undefined ? layoutStore() : options.store
  const w = fakeWidget({
    layoutStore: store,
    access: options.access ? { command: options.access } : undefined,
    capabilities: { saveLoad: { charts: false, layouts: store !== null, drawings: false, templates: false } },
    layoutSaveLoad: options.layoutSaveLoad ?? (options.notSaving ? { notSaving: () => true } : undefined),
  })
  const notices: string[] = []
  const notify = (kind: 'info' | 'error', text: string): void => void notices.push(`${kind}:${text}`)
  const listing = createLayoutListStore(w.storage)
  // The chrome's own dialogs, which the menu's rows and the commands both raise, exactly as
  // `mountChrome` builds them, so a never-saved layout meets one prompt whichever door asked.
  // The one catalog the chrome lists the store into, as the harness built it over this store.
  const catalog = w.topBarParts.layoutCatalog
  const dialogs = mountLayoutDialogs({ ...w.ctx, catalog, listing, notify })
  const menu = mountLayoutsMenu({ ...w.ctx, catalog, autosave: w.autosave, notify, listing, dialogs, changes: w.layoutChanges })
  document.body.appendChild(menu.element)
  w.setNameLayoutDoor(() => {
    dialogs.nameLayout()
    return true
  })
  w.setOpenLayoutsDoor(() => dialogs.openLayouts())
  cleanup.push(() => (menu.destroy(), dialogs.destroy(), w.dispose()))
  return { w, menu, notices, store }
}

describe('the flyout widths', () => {
  it('opens the arrangement grid at its measured 428px', () => {
    const w = fakeWidget()
    const setup = mountLayoutSetup(w.ctx)
    document.body.appendChild(setup.element)
    cleanup.push(() => (setup.destroy(), w.dispose()))
    setup.element.click()
    const panel = w.overlays.querySelector<HTMLElement>('.qc-layout-menu')!
    expect(panel.style.width).toBe(`${FLYOUT_WIDTH.arrangement}px`)
    expect(FLYOUT_WIDTH.arrangement).toBe(428)
    // Thirteen fixed rows, twelve rules between them, and one 18px count slot on each.
    expect(panel.querySelectorAll('.qc-layout-row').length).toBe(13)
    expect(panel.querySelectorAll('.qc-layout-grid > .qc-separator').length).toBe(12)
    expect(panel.querySelectorAll('.qc-layout-count').length).toBe(13)
  })

  it('holds the pinned width table for every chrome flyout', () => {
    expect(FLYOUT_WIDTH).toEqual({ timeframe: 192, chartStyle: 270, arrangement: 428, layouts: 197, layoutsSort: 234, timezone: 251, session: 176, replayStart: 177, replayTimeframe: 196 })
  })
})

describe('the period key opens the layout picker', () => {
  const openRowOf = (overlays: HTMLElement): HTMLButtonElement =>
    [...overlays.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((r) => r.querySelector('.qc-menu-label')?.textContent === 'Open layout…')!
  const pressPeriod = (root: HTMLElement): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key: '.', code: 'Period', bubbles: true, cancelable: true })
    root.dispatchEvent(event)
    return event
  }
  const keyboard = (w: ReturnType<typeof fakeWidget>): HTMLElement => {
    const root = document.body.appendChild(document.createElement('div'))
    const shortcuts = attachShortcuts({ root, commands: w.commands })
    cleanup.push(() => shortcuts.dispose())
    return root
  }

  it('names its key beside the Open row, and a press on the chart opens the dialog once', async () => {
    const { w, menu } = mountLayouts({ store: layoutStore([{ id: 'a', revision: '1', name: 'Alpha', updatedAt: Date.now() }]) })
    menu.element.querySelector<HTMLButtonElement>('.qc-layouts-caret')!.click()
    await settle()
    expect(openRowOf(w.overlays).querySelector('.qc-menu-hint')!.textContent).toBe('Dot')
    const root = keyboard(w)
    expect(pressPeriod(root).defaultPrevented).toBe(true)
    await settle()
    expect(w.overlays.querySelectorAll('[role="dialog"][aria-label="Layouts"]')).toHaveLength(1)
    // The menu gave way to the dialog, and asking again while it is up leaves it where it is.
    expect(w.overlays.querySelector('.qc-layouts-menu')).toBeNull()
    pressPeriod(root)
    await settle()
    expect(w.overlays.querySelectorAll('[role="dialog"][aria-label="Layouts"]')).toHaveLength(1)
  })

  it('leaves the key to the page when the access policy refuses the verb', async () => {
    const { w } = mountLayouts({ store: layoutStore(), access: (id) => id !== 'widget.layout.open' })
    expect(pressPeriod(keyboard(w)).defaultPrevented).toBe(false)
    await settle()
    expect(w.overlays.querySelector('[role="dialog"]')).toBeNull()
  })

  it('has nothing to open for a host that saves no layouts', async () => {
    const { w } = mountLayouts({ store: null })
    expect(w.commands.available('widget.layout.open')).toBe(false)
    expect(pressPeriod(keyboard(w)).defaultPrevented).toBe(false)
  })
})

describe('the saved-layouts menu', () => {
  it('opens at its measured 197px, its action rows marked at 28px and Save carrying its shortcut', () => {
    const { w, menu } = mountLayouts()
    menu.element.querySelector<HTMLButtonElement>('.qc-layouts-caret')!.click()
    const panel = w.overlays.querySelector<HTMLElement>('.qc-layouts-menu')!
    expect(panel.style.width).toBe(`${FLYOUT_WIDTH.layouts}px`)
    expect(FLYOUT_WIDTH.layouts).toBe(197)
    // Save carries no glyph; the five action rows below the first rule do, each a 28px mark.
    const marks = [...panel.querySelectorAll<HTMLElement>('.qc-menu-row .qc-menu-icon svg')]
    expect(marks.map((svg) => svg.getAttribute('width'))).toEqual(['28', '28', '28', '28', '28'])
    const save = [...panel.querySelectorAll<HTMLElement>('.qc-menu-row')].find((r) => r.querySelector('.qc-menu-label')?.textContent === 'Save layout')!
    expect(save.querySelector('.qc-menu-hint')!.textContent).toMatch(/^(Ctrl|Cmd) \+ S$/)
  })

  it('leaves the menu standing when Autosave is switched, so the knob slides rather than being replaced', () => {
    const { w, menu } = mountLayouts()
    menu.element.querySelector<HTMLButtonElement>('.qc-layouts-caret')!.click()
    const toggle = w.overlays.querySelector<HTMLButtonElement>('[role="switch"]')!
    toggle.click()
    expect(toggle.isConnected).toBe(true)
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(w.overlays.querySelector('[role="switch"]')).toBe(toggle)
  })

  it('writes a recent layout as its name over the market and timeframe its active chart showed', async () => {
    const store = layoutStore([{ id: 'a', revision: '1', name: 'Desk', symbol: 'BTCUSDC', timeframe: '1h', updatedAt: Date.now() - 5 * 60_000 }])
    const { w, menu } = mountLayouts({ store })
    menu.element.querySelector<HTMLButtonElement>('.qc-layouts-caret')!.click()
    await settle()
    const row = w.overlays.querySelector<HTMLElement>('.qc-layouts-recents [role="menuitemradio"]')!
    expect(row.querySelector('.qc-menu-text > .qc-menu-label')!.textContent).toBe('Desk')
    expect(row.querySelector('.qc-menu-text > .qc-menu-description')!.textContent).toBe('BTCUSDC, 1h')
  })

  it('writes a recent layout its store kept no market for as its name over when it was saved', async () => {
    const store = layoutStore([{ id: 'a', revision: '1', name: 'Alpha', updatedAt: Date.now() - 5 * 60_000 }])
    const { w, menu } = mountLayouts({ store })
    menu.element.querySelector<HTMLButtonElement>('.qc-layouts-caret')!.click()
    await settle()
    const row = w.overlays.querySelector<HTMLElement>('.qc-layouts-recents [role="menuitemradio"]')!
    expect(row.querySelector('.qc-menu-text > .qc-menu-label')!.textContent).toBe('Alpha')
    expect(row.querySelector('.qc-menu-text > .qc-menu-description')!.textContent).toBe('5 min. ago')
    expect(row.querySelector('.qc-menu-hint')).toBeNull()
  })

  it('rebuilds with the recent layouts it already listed, not a loading line, and then the fresh list', async () => {
    const store = layoutStore([{ id: 'a', revision: '1', name: 'Alpha', updatedAt: Date.now() - 60_000 }])
    const { w, menu } = mountLayouts({ store })
    menu.element.querySelector<HTMLButtonElement>('.qc-layouts-caret')!.click()
    await settle()
    const labels = (): string[] => [...w.overlays.querySelectorAll('.qc-layouts-recents .qc-menu-label')].map((l) => l.textContent ?? '')
    expect(labels()).toEqual(['Alpha'])
    // A change rebuilds the open menu; before the store answers again, the rows it had stand.
    w.events.emit('saveNeeded')
    expect(w.overlays.querySelector('.qc-layouts-recents .qc-menu-note')).toBeNull()
    expect(labels()).toEqual(['Alpha'])
    await settle()
    expect(labels()).toEqual(['Alpha'])
  })

  it('opens on the recent layouts the chrome listed as it mounted, before the store answers again', async () => {
    const store = layoutStore([{ id: 'a', revision: '1', name: 'Alpha', updatedAt: Date.now() - 60_000 }])
    const { w, menu } = mountLayouts({ store })
    await settle()
    // The mount listed the store once, before any door opened.
    expect(store.list).toHaveBeenCalledTimes(1)
    // The listing the open asks for never answers: the rows on show are the ones already in hand.
    vi.mocked(store.list).mockImplementation(() => new Promise<LayoutMeta[]>(() => undefined))
    menu.element.querySelector<HTMLButtonElement>('.qc-layouts-caret')!.click()
    expect(w.overlays.querySelector('.qc-layouts-recents .qc-menu-note')).toBeNull()
    expect([...w.overlays.querySelectorAll('.qc-layouts-recents .qc-menu-label')].map((l) => l.textContent)).toEqual(['Alpha'])
  })

  it('lists the store again after a save, and drops a deleted layout from the recent rows at once', async () => {
    const store = layoutStore([
      { id: 'a', revision: '1', name: 'Alpha', updatedAt: Date.now() - 60_000 },
      { id: 'b', revision: '1', name: 'Beta', updatedAt: Date.now() - 120_000 },
    ])
    const { w, menu } = mountLayouts({ store })
    await settle()
    menu.element.querySelector<HTMLButtonElement>('.qc-layouts-caret')!.click()
    await settle()
    const labels = (): string[] => [...w.overlays.querySelectorAll('.qc-layouts-recents .qc-menu-label')].map((l) => l.textContent ?? '')
    expect(labels()).toEqual(['Alpha', 'Beta'])
    store.rows = [...store.rows, { id: 'c', revision: '1', name: 'Gamma', updatedAt: Date.now() }]
    w.events.emit('layout', { kind: 'saved', id: 'c', name: 'Gamma' })
    await settle()
    expect(labels()).toEqual(['Gamma', 'Alpha', 'Beta'])
    vi.mocked(store.list).mockImplementation(() => new Promise<LayoutMeta[]>(() => undefined))
    w.events.emit('layout', { kind: 'removed', id: 'a', name: null })
    expect(labels()).toEqual(['Gamma', 'Beta'])
  })

  it('moves an autosaved layout to the front without listing the store again', async () => {
    const store = layoutStore([
      { id: 'a', revision: '1', name: 'Alpha', updatedAt: Date.now() - 60_000 },
      { id: 'b', revision: '1', name: 'Beta', updatedAt: Date.now() - 120_000 },
    ])
    const { w, menu } = mountLayouts({ store })
    await settle()
    const listings = vi.mocked(store.list).mock.calls.length
    // The menu is closed, as it is under an autosave.
    w.events.emit('layout', { kind: 'saved', id: 'b', name: 'Beta' })
    await settle()
    expect(vi.mocked(store.list).mock.calls.length).toBe(listings)
    // The next open paints the moved row before its own listing lands.
    vi.mocked(store.list).mockImplementation(() => new Promise<LayoutMeta[]>(() => undefined))
    menu.element.querySelector<HTMLButtonElement>('.qc-layouts-caret')!.click()
    expect([...w.overlays.querySelectorAll('.qc-layouts-recents .qc-menu-label')].map((l) => l.textContent)).toEqual(['Beta', 'Alpha'])
  })

  it('stars a recent layout from its row into the favorites the Layouts dialog keeps, and leaves the menu up', async () => {
    const store = layoutStore([
      { id: 'a', revision: '1', name: 'Alpha', updatedAt: Date.now() - 60_000 },
      { id: 'b', revision: '1', name: 'Beta', updatedAt: Date.now() },
    ])
    const { w, menu } = mountLayouts({ store })
    menu.element.querySelector<HTMLButtonElement>('.qc-layouts-caret')!.click()
    await settle()
    const recent = [...w.overlays.querySelectorAll<HTMLElement>('.qc-layouts-recent')].find((r) => r.querySelector('.qc-menu-label')!.textContent === 'Alpha')!
    const star = recent.querySelector<HTMLButtonElement>('.qc-layouts-recent-star')!
    // The star is the pointer's shortcut: out of the menu's keys, and named for what a press does.
    expect(star.tabIndex).toBe(-1)
    expect(star.getAttribute('aria-pressed')).toBe('false')
    expect(star.getAttribute('aria-label')).toBe('Add to favorites')
    star.click()
    expect(star.getAttribute('aria-pressed')).toBe('true')
    expect(star.getAttribute('aria-label')).toBe('Remove from favorites')
    expect(JSON.parse(w.storage.get('quickcharts.layoutFavorites.v1')!)).toEqual(['a'])
    // A star press is not a pick: the menu stays up and nothing opens.
    expect(w.overlays.querySelector('.qc-layouts-menu')).not.toBeNull()
    expect(w.widget.layout.saveLoad.load).not.toHaveBeenCalled()
    star.click()
    expect(star.getAttribute('aria-pressed')).toBe('false')
    expect(JSON.parse(w.storage.get('quickcharts.layoutFavorites.v1')!)).toEqual([])
  })

  it('names the layout, marks it dirty on a change, and saves a never-saved layout under a typed name through the command', async () => {
    clockForDialogExits()
    const { w, menu } = mountLayouts()
    const nameLabel = menu.element.querySelector<HTMLElement>('.qc-layouts-name')!
    const title = menu.element.querySelector<HTMLButtonElement>('.qc-layouts-title')!
    expect(nameLabel.textContent).toBe('Unnamed')
    expect(title.title).toBe('All changes saved')
    // Nothing to save: the name answers nothing but keeps its ink, marked unavailable, not disabled.
    expect(title.getAttribute('aria-disabled')).toBe('true')
    expect(title.disabled).toBe(false)
    w.events.emit('saveNeeded')
    expect(nameLabel.dataset.qcDirty).toBe('true')
    expect(title.title).toBe('Unsaved changes')
    expect(title.getAttribute('aria-disabled')).toBe('false')
    // Offering the save, it is named for the verb, the name every door to it shares.
    expect(title.getAttribute('aria-label')).toBe('Save layout')
    const saveLink = menu.element.querySelector<HTMLElement>('.qc-layouts-save')!
    expect(saveLink.hidden).toBe(false)
    expect(saveLink.textContent).toBe('Save')
    // Save rides inside the name: pressing either is the one button that saves.
    expect(title.contains(saveLink)).toBe(true)
    saveLink.click()
    const dialog = w.overlays.querySelector<HTMLElement>('.qc-prompt')!
    expect(dialog.querySelector('.qc-prompt-title')!.textContent).toBe('Save New Chart Layout')
    expect(dialog.querySelector('.qc-name-label')!.textContent).toBe('Enter a new chart layout name:')
    const field = dialog.querySelector<HTMLInputElement>('.qc-name-input')!
    const verb = dialog.querySelector<HTMLButtonElement>('.qc-prompt-actions .qc-button--primary')!
    // The verb waits for a name.
    expect(field.value).toBe('')
    expect(verb.disabled).toBe(true)
    field.value = 'Desk'
    field.dispatchEvent(new Event('input'))
    expect(verb.disabled).toBe(false)
    verb.click()
    await settle()
    await pastDialogExit()
    expect(w.overlays.querySelector('.qc-prompt')).toBeNull()
    expect(w.widget.layout.saveLoad.save).toHaveBeenCalledWith('Desk', { asNew: true })
    expect(nameLabel.textContent).toBe('Desk')
    expect(nameLabel.dataset.qcDirty).toBe('false')
  })

  it('renames the open layout and creates a new one through the name dialog, each by its command', async () => {
    clockForDialogExits()
    const store = layoutStore([{ id: 'a', revision: '1', name: 'layout a', updatedAt: Date.now() }])
    const { w, menu } = mountLayouts({ store })
    const menuRow = (text: string): HTMLButtonElement => [...w.overlays.querySelectorAll<HTMLButtonElement>('.qc-layouts-menu .qc-menu-row')].find((r) => r.querySelector('.qc-menu-label')?.textContent === text)!
    // Create stands on for a layout that was never saved, not only for one that was.
    menu.element.querySelector<HTMLButtonElement>('.qc-layouts-caret')!.click()
    expect(menuRow('Create new layout…').disabled).toBe(false)
    await settle()
    w.overlays.querySelector<HTMLButtonElement>('.qc-layouts-recents [role="menuitemradio"]')!.click()
    await settle()
    const run = vi.spyOn(w.commands, 'execute')
    menu.element.querySelector<HTMLButtonElement>('.qc-layouts-caret')!.click()
    menuRow('Rename…').click()
    // The row hands off to the dialog, and the menu goes.
    expect(w.overlays.querySelector('.qc-layouts-menu')).toBeNull()
    let dialog = w.overlays.querySelector<HTMLElement>('.qc-prompt')!
    expect(dialog.getAttribute('aria-label')).toBe('Rename chart layout')
    expect(dialog.querySelector('.qc-name-label')!.textContent).toBe('New layout name')
    let field = dialog.querySelector<HTMLInputElement>('.qc-name-input')!
    expect(field.value).toBe('layout a')
    expect(document.activeElement).toBe(field)
    expect(dialog.querySelector('.qc-prompt-actions .qc-button--primary')!.textContent).toBe('Rename')
    field.value = 'Desk 2'
    field.dispatchEvent(new Event('input'))
    press(field, 'Enter')
    expect(run).toHaveBeenCalledWith('widget.layout.rename', 'Desk 2')
    await settle()
    // The fake chart keeps no content to start a layout from, so the create verb is only heard.
    run.mockImplementation(() => ({ kind: 'ok' }) as never)
    menu.element.querySelector<HTMLButtonElement>('.qc-layouts-caret')!.click()
    menuRow('Create new layout…').click()
    dialog = w.overlays.querySelector<HTMLElement>('.qc-prompt')!
    expect(dialog.querySelector('.qc-prompt-title')!.textContent).toBe('Create layout')
    field = dialog.querySelector<HTMLInputElement>('.qc-name-input')!
    expect(field.value).toBe('')
    expect(field.placeholder).toBe('My layout')
    const verb = dialog.querySelector<HTMLButtonElement>('.qc-prompt-actions .qc-button--primary')!
    expect(verb.textContent).toBe('Create')
    expect(verb.disabled).toBe(true)
    field.value = 'Swing'
    field.dispatchEvent(new Event('input'))
    verb.click()
    expect(run).toHaveBeenCalledWith('widget.layout.create', 'Swing')
    await pastDialogExit()
    expect(w.overlays.querySelector('.qc-prompt')).toBeNull()
    // Cancel and the cross close without a word to the store.
    menu.element.querySelector<HTMLButtonElement>('.qc-layouts-caret')!.click()
    menuRow('Rename…').click()
    run.mockClear()
    w.overlays.querySelector<HTMLButtonElement>('.qc-prompt-actions .qc-button--secondary')!.click()
    await pastDialogExit()
    expect(w.overlays.querySelector('.qc-prompt')).toBeNull()
    expect(run).not.toHaveBeenCalled()
  })

  it('offers Download chart data, which runs the export command of the chart on screen', () => {
    const { w, menu } = mountLayouts()
    const created = vi.fn(() => 'blob:x')
    vi.stubGlobal('URL', Object.assign(Object.create(URL), { createObjectURL: created, revokeObjectURL: vi.fn() }))
    let name = ''
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      name = this.download
    })
    menu.element.querySelector<HTMLButtonElement>('.qc-layouts-caret')!.click()
    const row = [...w.overlays.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((b) => b.textContent?.includes('Download chart data'))!
    expect(row).toBeDefined()
    expect(row.getAttribute('aria-disabled')).not.toBe('true')
    row.click()
    expect(created).toHaveBeenCalledTimes(1)
    expect(name).toBe('ES_1m.csv')
    click.mockRestore()
    vi.unstubAllGlobals()
  })

  it('disables the download row when the host access policy refuses the export', () => {
    const { w, menu } = mountLayouts({ access: (id) => id !== 'chart.data.download' })
    menu.element.querySelector<HTMLButtonElement>('.qc-layouts-caret')!.click()
    const row = [...w.overlays.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((b) => b.textContent?.includes('Download chart data'))!
    expect(row.getAttribute('aria-disabled')).toBe('true')
  })

  it('autosave runs through its command, writes the open layout on each change, and hides the Save link', async () => {
    const { w, menu } = mountLayouts()
    w.commands.execute('widget.layout.save', 'Desk')
    await settle()
    menu.element.querySelector<HTMLButtonElement>('.qc-layouts-caret')!.click()
    w.overlays.querySelector<HTMLButtonElement>('[role="switch"]')!.click()
    expect(w.autosave.get()).toBe(true)
    w.events.emit('saveNeeded')
    await settle()
    expect(w.widgetCalls.filter((c) => c === 'save:Desk').length).toBe(2)
    expect(menu.element.querySelector<HTMLButtonElement>('.qc-layouts-save')!.hidden).toBe(true)
  })

  it('lists the recent layouts, opens one through the command, and reports a refused save', async () => {
    const store = layoutStore([
      { id: 'a', revision: '1', name: 'Alpha', updatedAt: Date.now() - 60_000 },
      { id: 'b', revision: '1', name: 'Beta', updatedAt: Date.now() },
    ])
    const { w, menu } = mountLayouts({ store })
    const refused: string[] = []
    w.events.on('saveConflict', (info) => refused.push(info.message))
    menu.element.querySelector<HTMLButtonElement>('.qc-layouts-caret')!.click()
    await settle()
    const rows = [...w.overlays.querySelectorAll<HTMLButtonElement>('.qc-layouts-recents [role="menuitemradio"]')]
    expect(rows.map((r) => r.querySelector('.qc-menu-label')!.textContent)).toEqual(['Beta', 'Alpha'])
    rows[1]!.click()
    await settle()
    expect(w.widget.layout.saveLoad.load).toHaveBeenCalledWith('a')
    expect(menu.element.querySelector('.qc-layouts-name')!.textContent).toBe('layout a')
    ;(w.resource.save as unknown as { mockResolvedValueOnce(v: unknown): void }).mockResolvedValueOnce({ kind: 'conflict', current: { id: 'a', revision: '2' }, message: 'Saved elsewhere.' })
    w.events.emit('saveNeeded')
    menu.element.querySelector<HTMLButtonElement>('.qc-layouts-save')!.click()
    await settle()
    expect(refused).toEqual(['Saved elsewhere.'])
    expect(menu.element.querySelector<HTMLElement>('.qc-layouts-name')!.dataset.qcDirty).toBe('true')
  })

  it('every way a verb can end reaches the viewer once, and a load nobody is waiting for reaches them not at all', async () => {
    const { w } = mountLayouts()
    const refused: string[] = []
    w.events.on('saveConflict', (info) => refused.push(`${info.current?.id ?? 'none'}:${info.message}`))
    const opened: string[] = []
    w.events.on('layout', (event) => opened.push(`${event.kind}:${event.name ?? ''}`))
    const save = w.resource.save as unknown as { mockResolvedValueOnce(v: unknown): void }
    const load = w.resource.load as unknown as { mockResolvedValueOnce(v: unknown): void }
    // A layout that could not be put back, an id the store lost, a body it cannot read, and a store
    // it could not reach: four different sentences, each one shown once.
    save.mockResolvedValueOnce({ kind: 'not-saving', message: 'Not saving.' })
    w.commands.execute('widget.layout.save', 'Desk')
    await settle()
    save.mockResolvedValueOnce({ kind: 'not-found', message: 'Deleted elsewhere.' })
    w.commands.execute('widget.layout.save', 'Desk')
    await settle()
    load.mockResolvedValueOnce({ kind: 'invalid', message: 'Could not be opened.' })
    w.commands.execute('widget.layout.load', 'a')
    await settle()
    load.mockResolvedValueOnce({ kind: 'unavailable', message: 'Could not be reached.', cause: new Error('offline') })
    w.commands.execute('widget.layout.load', 'a')
    await settle()
    expect(refused).toEqual(['none:Not saving.', 'none:Deleted elsewhere.', 'none:Could not be opened.', 'none:Could not be reached.'])
    // A load the viewer themselves replaced is nobody's news: nothing moved, and nothing is said.
    load.mockResolvedValueOnce({ kind: 'cancelled' })
    w.commands.execute('widget.layout.load', 'a')
    await settle()
    expect(refused.length).toBe(4)
    expect(opened).toEqual([])
  })

  it('the open dialog searches, opens and deletes behind a confirm, the delete through its command', async () => {
    const store = layoutStore([
      { id: 'a', revision: '1', name: 'Alpha', updatedAt: Date.now() },
      { id: 'b', revision: '1', name: 'Beta', updatedAt: Date.now() },
    ])
    const { w } = mountLayouts({ store })
    document.body.querySelector<HTMLButtonElement>('.qc-layouts-caret')!.click()
    await settle()
    ;[...w.overlays.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((r) => r.querySelector('.qc-menu-label')?.textContent === 'Open layout…')!.click()
    await settle()
    const dialog = w.overlays.querySelector<HTMLElement>('[role="dialog"][aria-label="Layouts"]')!
    const search = dialog.querySelector<HTMLInputElement>('.qc-layouts-search-input')!
    search.value = 'bet'
    search.dispatchEvent(new Event('input'))
    expect([...dialog.querySelectorAll('.qc-layouts-item-name')].map((n) => n.textContent)).toEqual(['Beta'])
    dialog.querySelector<HTMLButtonElement>('.qc-layouts-delete')!.click()
    // The question is its own modal beside the browser, not a band inside its list.
    const confirm = w.overlays.querySelector<HTMLElement>('[role="alertdialog"]')!
    expect(confirm).not.toBeNull()
    confirm.querySelector<HTMLButtonElement>('button[aria-label="Delete"]')!.click()
    await settle()
    expect(store.remove).toHaveBeenCalledWith({ id: 'b', revision: '1' })
    expect(dialog.querySelectorAll('.qc-layouts-item').length).toBe(0)
  })

  it('a policy that refuses the layout verbs disables every row and nothing reaches the store', async () => {
    const store = layoutStore([{ id: 'a', revision: '1', name: 'Alpha', updatedAt: Date.now() }])
    const { w, menu } = mountLayouts({ store, access: (id) => !id.startsWith('widget.layout.') })
    w.events.emit('saveNeeded')
    expect(menu.element.querySelector<HTMLButtonElement>('.qc-layouts-save')!.hidden).toBe(true)
    menu.element.querySelector<HTMLButtonElement>('.qc-layouts-caret')!.click()
    await settle()
    const rows = [...w.overlays.querySelectorAll<HTMLButtonElement>('[role="menuitem"], [role="menuitemradio"], [role="switch"]')]
    const byText = (text: string): HTMLButtonElement => rows.find((r) => (r.querySelector('.qc-menu-label')?.textContent ?? r.textContent) === text || r.getAttribute('aria-label') === text)!
    for (const text of ['Save layout', 'Autosave', 'Make a copy…', 'Rename…', 'Create new layout…', 'Alpha']) expect(byText(text).disabled, text).toBe(true)
    for (const text of ['Save layout', 'Make a copy…', 'Create new layout…', 'Alpha']) byText(text).click()
    await settle()
    expect(w.widget.layout.saveLoad.save).not.toHaveBeenCalled()
    expect(w.widget.layout.saveLoad.load).not.toHaveBeenCalled()
    expect(w.widgetCalls).toEqual([])
    // The command itself refuses too, whichever door asked.
    expect(w.commands.execute('widget.layout.delete', { id: 'a', revision: '1' }).kind).toBe('denied')
    expect(store.remove).not.toHaveBeenCalled()
  })

  it('a layout that could not be put back stops the autosave, dims Save, and says so on the toolbar', async () => {
    const { w, menu } = mountLayouts({ notSaving: true })
    // The one write in this test is the explicit save that binds the name; every ask after it is an
    // autosave, and none of them may reach the store, because what is on screen is neither the
    // layout that was asked for nor the one that was held.
    w.commands.execute('widget.layout.save', 'Desk')
    await settle()
    // Dirty and autosave still off: this is the state where the toolbar would otherwise offer the
    // Save link and the menu would otherwise offer the Save row.
    w.events.emit('saveNeeded')
    await settle()
    const nameLabel = menu.element.querySelector<HTMLElement>('.qc-layouts-name')!
    expect(menu.element.querySelector<HTMLElement>('.qc-layouts-title')!.title).toBe('Not saving until this is restored')
    expect(nameLabel.dataset.qcNotSaving).toBe('true')
    expect(menu.element.querySelector<HTMLButtonElement>('.qc-layouts-save')!.hidden).toBe(true)
    menu.element.querySelector<HTMLButtonElement>('.qc-layouts-caret')!.click()
    const rows = [...w.overlays.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    const byText = (text: string): HTMLButtonElement => rows.find((r) => r.querySelector('.qc-menu-label')?.textContent === text)!
    expect(byText('Save layout').disabled).toBe(true)
    // The way back stays open: a copy writes over nothing.
    expect(byText('Make a copy…').disabled).toBe(false)
    // Switching the autosave on catches a dirty layout up, and this one it must not.
    w.overlays.querySelector<HTMLButtonElement>('[role="switch"]')!.click()
    expect(w.autosave.get()).toBe(true)
    await settle()
    expect(w.widgetCalls.filter((c) => c === 'save:Desk').length).toBe(1)
    // And every later change, with the autosave now on.
    w.events.emit('saveNeeded')
    await settle()
    expect(w.widgetCalls.filter((c) => c === 'save:Desk').length).toBe(1)
  })

  it('a copy of a layout that could not be put back writes its own row and nothing else: the manual save, the autosave and the catch-up all stay refused', async () => {
    const layout = realLayoutSaveLoad()
    const { w, menu } = mountLayouts({ layoutSaveLoad: layout.saveLoad })
    const refused: string[] = []
    w.events.on('saveConflict', (info) => refused.push(info.message))
    // A layout saved under a name, the way a viewer gets one.
    w.commands.execute('widget.layout.save', 'Desk')
    await settle()
    const desk = layout.saveLoad.current()!.ref
    await layout.couldNotBePutBack()
    w.events.emit('saveNeeded')
    await settle()
    const nameLabel = menu.element.querySelector<HTMLElement>('.qc-layouts-name')!
    expect(nameLabel.dataset.qcNotSaving).toBe('true')
    // The copy the viewer asks for by name, through the menu row that is still on.
    menu.element.querySelector<HTMLButtonElement>('.qc-layouts-caret')!.click()
    const copyRow = [...w.overlays.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((r) => r.querySelector('.qc-menu-label')?.textContent === 'Make a copy…')!
    expect(copyRow.disabled).toBe(false)
    copyRow.click()
    const dialog = w.overlays.querySelector<HTMLElement>('.qc-prompt')!
    expect(dialog.querySelector('.qc-prompt-title')!.textContent).toBe('Make copy of chart layout')
    const field = dialog.querySelector<HTMLInputElement>('.qc-name-input')!
    expect(field.value).toBe('Desk copy')
    dialog.querySelector<HTMLButtonElement>('.qc-prompt-actions .qc-button--primary')!.click()
    await settle()
    // It wrote a row of its own, and Desk stands at the revision it stood at.
    expect(layout.writes).toEqual(['create:Desk copy'])
    expect((await layout.store.load(desk.id))!.ref.revision).toBe(desk.revision)
    // A store taking that write is not evidence the tiles are whole, so the layout still saves
    // nowhere. The toolbar says so, and the Save link stays down on a dirty layout.
    expect(layout.saveLoad.notSaving()).toBe(true)
    expect(nameLabel.textContent).toBe('Desk copy')
    expect(menu.element.querySelector<HTMLElement>('.qc-layouts-title')!.title).toBe('Not saving until this is restored')
    w.events.emit('saveNeeded')
    await settle()
    expect(menu.element.querySelector<HTMLButtonElement>('.qc-layouts-save')!.hidden).toBe(true)
    // The manual save, from the command every door reaches: refused, with its sentence for the
    // viewer, and the store untouched.
    w.commands.execute('widget.layout.save')
    await settle()
    expect(refused).toEqual([w.i18n.t('host.notSaving')])
    // Switching the autosave on, which catches a dirty layout up, and every change after it.
    menu.element.querySelector<HTMLButtonElement>('.qc-layouts-caret')!.click()
    w.overlays.querySelector<HTMLButtonElement>('[role="switch"]')!.click()
    expect(w.autosave.get()).toBe(true)
    await settle()
    w.events.emit('saveNeeded')
    await settle()
    expect(layout.writes).toEqual(['create:Desk copy'])
    expect((await layout.store.list()).map((r) => r.name).sort()).toEqual(['Desk', 'Desk copy', 'Elsewhere'])
  })

  it('without a store, saving is offered nowhere', () => {
    const { w, menu } = mountLayouts({ store: null })
    w.events.emit('saveNeeded')
    expect(menu.element.querySelector<HTMLButtonElement>('.qc-layouts-save')!.hidden).toBe(true)
    menu.element.querySelector<HTMLButtonElement>('.qc-layouts-caret')!.click()
    const save = [...w.overlays.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((r) => r.querySelector('.qc-menu-label')?.textContent === 'Save layout')!
    expect(save.disabled).toBe(true)
  })

  it('writes a relative time in the language', () => {
    const now = Date.now()
    expect(relativeTime('en', now - 5 * 60_000, now)).toMatch(/5/)
    expect(relativeTime('en', now - 3 * 3_600_000, now)).toMatch(/3/)
    expect(relativeTime('en', now - 2 * 86_400_000, now)).toMatch(/2/)
    expect(relativeTime('en', now - 5 * 60_000, now)).toBe('5 min. ago')
  })

  it('writes it as words, never as a signed number, in languages whose narrow form is one', () => {
    const now = Date.now()
    for (const tag of ['fr', 'sv', 'ru', 'de']) {
      for (const age of [5 * 60_000, 3 * 3_600_000, 2 * 86_400_000]) {
        expect(relativeTime(tag, now - age, now), `${tag} ${age}`).not.toMatch(/^\s*[-−+]/)
      }
    }
    expect(relativeTime('de', now - 5 * 60_000, now)).toBe('vor 5 Min.')
  })
})

describe('the Layouts dialog', () => {
  async function openLayouts(store: ReturnType<typeof layoutStore>) {
    const mounted = mountLayouts({ store })
    mounted.w.commands.execute('widget.layout.open')
    await settle()
    const dialog = mounted.w.overlays.querySelector<HTMLElement>('[role="dialog"][aria-label="Layouts"]')!
    const names = (): (string | null)[] => [...dialog.querySelectorAll('.qc-layouts-item-name')].map((n) => n.textContent)
    const row = (name: string): HTMLElement => [...dialog.querySelectorAll<HTMLElement>('.qc-layouts-item')].find((r) => r.querySelector('.qc-layouts-item-name')?.textContent === name)!
    return { ...mounted, dialog, names, row }
  }

  it('lists the newest first, and sorts by name or by age from its column, keeping the choice', async () => {
    const { w, dialog, names } = await openLayouts(
      layoutStore([
        { id: 'a', revision: '1', name: 'Alpha', updatedAt: 1_000 },
        { id: 'b', revision: '1', name: 'beta', updatedAt: 3_000 },
        { id: 'c', revision: '1', name: 'Gamma', updatedAt: 2_000 },
      ]),
    )
    expect(dialog.querySelector('.qc-layouts-column')!.textContent).toBe('Layout name')
    expect(names()).toEqual(['beta', 'Gamma', 'Alpha'])
    dialog.querySelector<HTMLButtonElement>('button[aria-label="Sort by layout name, date changed"]')!.click()
    const option = (text: string): HTMLButtonElement => [...w.overlays.querySelectorAll<HTMLButtonElement>('.qc-layouts-sort-menu [role="menuitemradio"]')].find((r) => r.textContent === text)!
    expect(option('Date modified (newest first)').getAttribute('aria-checked')).toBe('true')
    option('Layout name (A to Z)').click()
    expect(names()).toEqual(['Alpha', 'beta', 'Gamma'])
    expect(w.storage.get('quickcharts.layoutSort.v1')).toBe('name-asc')
  })

  it('keeps a starred layout first with its star up, and forgets the star with a deleted row', async () => {
    const { w, names, row } = await openLayouts(
      layoutStore([
        { id: 'a', revision: '1', name: 'Alpha', updatedAt: 1_000 },
        { id: 'b', revision: '1', name: 'Beta', updatedAt: 2_000 },
      ]),
    )
    expect(names()).toEqual(['Beta', 'Alpha'])
    row('Alpha').querySelector<HTMLButtonElement>('button[aria-label="Add to favorites"]')!.click()
    expect(names()).toEqual(['Alpha', 'Beta'])
    expect(row('Alpha').querySelector('.qc-layouts-star')!.getAttribute('aria-pressed')).toBe('true')
    expect(JSON.parse(w.storage.get('quickcharts.layoutFavorites.v1')!)).toEqual(['a'])
    row('Alpha').querySelector<HTMLButtonElement>('.qc-layouts-delete')!.click()
    w.overlays.querySelector<HTMLButtonElement>('[role="alertdialog"] button[aria-label="Delete"]')!.click()
    await settle()
    expect(names()).toEqual(['Beta'])
    expect(JSON.parse(w.storage.get('quickcharts.layoutFavorites.v1')!)).toEqual([])
  })

  it('writes each layout as what it shows and when it was saved, and marks the one on screen', async () => {
    const at = new Date(2026, 8, 18, 17, 46).getTime()
    const { w, dialog, row } = await openLayouts(
      layoutStore([
        { id: 'a', revision: '1', name: 'Desk', symbol: 'NQ1!', timeframe: '4h', updatedAt: at },
        { id: 'b', revision: '1', name: 'Old', updatedAt: at - 60_000 },
      ]),
    )
    expect(row('Desk').querySelector('.qc-layouts-item-meta')!.textContent).toBe('NQ1!, 4h (Sep 18, 2026, 17:46)')
    expect(row('Old').querySelector('.qc-layouts-item-meta')!.textContent).toBe('Sep 18, 2026, 17:45')
    expect(row('Desk').getAttribute('aria-current')).toBeNull()
    dialog.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click()
    w.commands.execute('widget.layout.load', 'a')
    await settle()
    w.commands.execute('widget.layout.open')
    await settle()
    const reopened = w.overlays.querySelector<HTMLElement>('[role="dialog"][aria-label="Layouts"]')!
    const desk = [...reopened.querySelectorAll<HTMLElement>('.qc-layouts-item')].find((r) => r.querySelector('.qc-layouts-item-name')?.textContent === 'Desk')!
    expect(desk.getAttribute('aria-current')).toBe('true')
  })
})
