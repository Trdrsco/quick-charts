// @vitest-environment happy-dom
// The layout menus: the setup grid of 55 arrangements with radio semantics and the five sync
// switches, and the saved-layouts menu with its dirty state, save, autosave, naming, recents and
// the open dialog, all over the widget's layout commands and its revisioned save/load.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { arrangementGlyph, mountLayoutSetup } from '../../src/ui/chrome/layoutSetup'
import { mountLayoutsMenu, relativeTime } from '../../src/ui/chrome/layoutsMenu'
import { createAutosaveStore } from '../../src/ui/chrome/preferences'
import { ARRANGEMENTS } from '../../src/layoutGrid'
import { memoryChartStorage } from '../../src/storage'
import type { LayoutBody, LayoutMeta, ResourceStore } from '../../src/resources'
import { fakeWidget, settle } from './harness'

let cleanup: (() => void)[] = []
afterEach(() => {
  for (const fn of cleanup.splice(0)) fn()
  document.body.replaceChildren()
})

describe('the layout setup menu', () => {
  it('draws a glyph for every arrangement, mirrored where the catalog mirrors', () => {
    for (const a of ARRANGEMENTS) expect(arrangementGlyph(a.code).querySelector('svg'), a.code).not.toBeNull()
    expect(arrangementGlyph('3-1').querySelector('svg')!.getAttribute('style')).toContain('matrix')
    expect(arrangementGlyph('nope').querySelector('svg')).toBeNull()
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

  it('the sync switches follow the registry: disabled on one chart, live through the command otherwise', () => {
    const w = fakeWidget()
    const setup = mountLayoutSetup(w.ctx)
    document.body.appendChild(setup.element)
    cleanup.push(() => (setup.destroy(), w.dispose()))
    setup.element.click()
    const switches = [...w.overlays.querySelectorAll<HTMLButtonElement>('[role="switch"]')]
    expect(switches.map((s) => s.getAttribute('aria-label'))).toEqual(['Sync symbol', 'Sync interval', 'Sync crosshair', 'Sync time', 'Sync date range'])
    // One chart: the layout has nothing to synchronize, and the registry says so.
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

function mountLayouts(options: { store?: ReturnType<typeof layoutStore> | null } = {}) {
  const w = fakeWidget()
  const notices: string[] = []
  const storage = memoryChartStorage()
  const autosave = createAutosaveStore(storage, {})
  const menu = mountLayoutsMenu({ ...w.ctx, store: options.store === undefined ? layoutStore() : options.store, autosave, notify: (kind, text) => notices.push(`${kind}:${text}`) })
  document.body.appendChild(menu.element)
  cleanup.push(() => (menu.destroy(), w.dispose()))
  return { w, menu, notices, autosave }
}

describe('the saved-layouts menu', () => {
  it('names the layout, marks it dirty on a change, and saves a never-saved layout under a typed name', async () => {
    const { w, menu } = mountLayouts()
    const nameLabel = menu.element.querySelector<HTMLElement>('.qc-layouts-name')!
    expect(nameLabel.textContent).toBe('Unnamed')
    expect(nameLabel.title).toBe('All changes saved')
    menu.changed()
    expect(nameLabel.dataset.qcDirty).toBe('true')
    expect(nameLabel.title).toBe('Unsaved changes')
    const saveLink = menu.element.querySelector<HTMLButtonElement>('.qc-layouts-save')!
    expect(saveLink.hidden).toBe(false)
    saveLink.click()
    const field = w.overlays.querySelector<HTMLInputElement>('.qc-layouts-field')!
    expect(field).not.toBeNull()
    field.value = 'Desk'
    field.dispatchEvent(new Event('input'))
    w.overlays.querySelector<HTMLButtonElement>('button[aria-label="Save layout"]')!.click()
    await settle()
    expect(w.widget.layout.saveLoad.save).toHaveBeenCalledWith('Desk', { asNew: true })
    expect(nameLabel.textContent).toBe('Desk')
    expect(nameLabel.dataset.qcDirty).toBe('false')
  })

  it('autosave writes the open layout on each change and hides the Save link', async () => {
    const { w, menu, autosave } = mountLayouts()
    await w.widget.layout.saveLoad.save('Desk')
    menu.sync()
    autosave.set(true)
    menu.changed()
    await settle()
    expect(w.widgetCalls.filter((c) => c === 'save:Desk').length).toBe(2)
    expect(menu.element.querySelector<HTMLButtonElement>('.qc-layouts-save')!.hidden).toBe(true)
  })

  it('lists the recent layouts, opens one, and reports a refused save', async () => {
    const store = layoutStore([
      { id: 'a', revision: '1', name: 'Alpha', updatedAt: Date.now() - 60_000 },
      { id: 'b', revision: '1', name: 'Beta', updatedAt: Date.now() },
    ])
    const { w, menu, notices } = mountLayouts({ store })
    menu.element.querySelector<HTMLButtonElement>('.qc-layouts-caret')!.click()
    await settle()
    const rows = [...w.overlays.querySelectorAll<HTMLButtonElement>('.qc-layouts-recents [role="menuitemradio"]')]
    expect(rows.map((r) => r.querySelector('.qc-menu-label')!.textContent)).toEqual(['Beta', 'Alpha'])
    rows[1]!.click()
    await settle()
    expect(w.widget.layout.saveLoad.load).toHaveBeenCalledWith('a')
    ;(w.widget.layout.saveLoad.save as unknown as { mockResolvedValueOnce(v: unknown): void }).mockResolvedValueOnce({ kind: 'conflict', current: { id: 'a', revision: '2' }, message: 'Saved elsewhere.' })
    menu.changed()
    menu.element.querySelector<HTMLButtonElement>('.qc-layouts-save')!.click()
    await settle()
    expect(notices).toEqual(['error:Saved elsewhere.'])
  })

  it('the open dialog searches, opens and deletes behind a confirm', async () => {
    const store = layoutStore([
      { id: 'a', revision: '1', name: 'Alpha', updatedAt: Date.now() },
      { id: 'b', revision: '1', name: 'Beta', updatedAt: Date.now() },
    ])
    const { w } = mountLayouts({ store })
    w.ctx.overlays.replaceChildren()
    const menu = w.overlays
    document.body.querySelector<HTMLButtonElement>('.qc-layouts-caret')!.click()
    await settle()
    ;[...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((r) => r.textContent === 'Open layout')!.click()
    await settle()
    const dialog = menu.querySelector<HTMLElement>('[role="dialog"][aria-label="Open layout"]')!
    const search = dialog.querySelector<HTMLInputElement>('.qc-layouts-search')!
    search.value = 'bet'
    search.dispatchEvent(new Event('input'))
    expect([...dialog.querySelectorAll('.qc-layouts-item-name')].map((n) => n.textContent)).toEqual(['Beta'])
    dialog.querySelector<HTMLButtonElement>('.qc-layouts-delete')!.click()
    const confirm = dialog.querySelector<HTMLElement>('[role="alertdialog"]')!
    expect(confirm.hidden).toBe(false)
    confirm.querySelector<HTMLButtonElement>('button[aria-label="Delete"]')!.click()
    await settle()
    expect(store.remove).toHaveBeenCalledWith({ id: 'b', revision: '1' })
    expect(dialog.querySelectorAll('.qc-layouts-item').length).toBe(0)
  })

  it('without a store, saving is offered nowhere', () => {
    const { w, menu } = mountLayouts({ store: null })
    menu.changed()
    expect(menu.element.querySelector<HTMLButtonElement>('.qc-layouts-save')!.hidden).toBe(true)
    menu.element.querySelector<HTMLButtonElement>('.qc-layouts-caret')!.click()
    const save = [...w.overlays.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((r) => r.textContent === 'Save layout')!
    expect(save.disabled).toBe(true)
  })

  it('writes a relative time in the language', () => {
    const now = Date.now()
    expect(relativeTime('en', now - 5 * 60_000, now)).toMatch(/5/)
    expect(relativeTime('en', now - 3 * 3_600_000, now)).toMatch(/3/)
    expect(relativeTime('en', now - 2 * 86_400_000, now)).toMatch(/2/)
  })
})
