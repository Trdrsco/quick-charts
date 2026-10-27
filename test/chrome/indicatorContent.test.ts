// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openIndicatorPicker } from '../../src/ui/chrome/indicatorPicker'
import { pickerCollections, pickerKinds, pickerRows } from '../../src/ui/chrome/indicatorPickerData'
import type { IndicatorPickerSource } from '../../src/widget/indicatorPicker'
import { fakeWidget, press } from './harness'

const cleanup: (() => void)[] = []
afterEach(() => { cleanup.splice(0).forEach((off) => off()); document.body.replaceChildren() })
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done }); return { resolve, promise } }
const item = { id: 'example', title: 'Example', primaryAction: 'edit', favorite: false, actions: [{ id: 'edit', label: 'Edit' }] }
const source = (overrides: Partial<IndicatorPickerSource> = {}): IndicatorPickerSource => ({ collections: [{ id: 'host', label: 'Host' }], list: async () => ({ kind: 'ok', items: [item] }), act: async () => ({ kind: 'ok' }), ...overrides })
function open(host?: IndicatorPickerSource) {
  const w = fakeWidget()
  const dialog = openIndicatorPicker({ ...w.ctx, storage: w.storage, indicatorPicker: host })
  cleanup.push(() => { dialog.close(); w.dispose() })
  const pick = (id: string) => dialog.element.querySelector<HTMLButtonElement>('[data-picker-collection="' + id + '"]')!.click()
  return { w, dialog, pick }
}

describe('host content contract', () => {
  it('refuses reserved and duplicate collections, items, actions and unresolved primary actions', () => {
    expect(pickerCollections([{ id: 'builtin', label: 'Override' }])).toBeNull()
    expect(pickerCollections([{ id: 'x', label: 'X' }, { id: 'x', label: 'Again' }])).toBeNull()
    for (const items of [[{ ...item, id: 'sma' }], [item, item], [{ ...item, primaryAction: 'absent' }], [{ ...item, actions: [{ id: 'add', label: 'Override' }] }], [{ ...item, actions: [item.actions[0], item.actions[0]] }], [{ ...item, favoriteCount: -1 }], [{ ...item, favorite: 'yes' }]]) expect(pickerRows({ kind: 'ok', items })).toBeNull()
    expect(pickerRows({ kind: 'ok', items: [], builtIns: [{ id: 'unknown' }] })).toBeNull()
    expect(pickerRows({ kind: 'ok', items: [], builtIns: [{ id: 'sma' }, { id: 'sma' }] })).toBeNull()
  })
  it('snapshots row identities and ignores attempted definition replacement', () => {
    const original = { ...item, actions: [{ id: 'edit', label: 'Edit' }] }
    const parsed = pickerRows({ kind: 'ok', items: [original], builtIns: [{ id: 'sma', title: 'Replacement', definition: {} }] })!
    original.actions[0]!.id = 'delete'
    expect(parsed.items[0]!.actions[0]!.id).toBe('edit')
    expect(parsed.builtIns).toEqual([{ id: 'sma', actions: [] }])
  })
  it('keeps built-ins available when host metadata or reads fail, and does not invent favorite counts', async () => {
    const { dialog } = open(source({ list: async () => { throw new Error('<img src=x>') } }))
    await settle()
    expect(dialog.element.querySelectorAll('[data-indicator]')).toHaveLength(23)
    expect(dialog.element.querySelector('[role="status"]')?.textContent).toContain('unavailable')
    expect(dialog.element.querySelector('.qc-picker-count')?.textContent).toBe('')
    expect(dialog.element.querySelector('img')).toBeNull()
  })
  it('keeps hosted builtin metadata separate from repeated package Add', async () => {
    const act = vi.fn(async () => ({ kind: 'ok' as const }))
    const { w, dialog } = open(source({ act, list: async () => ({ kind: 'ok', items: [], builtIns: [{ id: 'sma', favorite: true, favoriteCount: 12, actions: [{ id: 'source', label: 'Source' }] }] }) }))
    await settle()
    const add = dialog.element.querySelector<HTMLButtonElement>('[data-indicator="sma"]')!
    add.click(); add.click()
    expect(w.ctx.widget.activeChart().indicators.get().map((row) => row.id)).toEqual(['sma-1', 'sma-2'])
    expect(act).not.toHaveBeenCalled()
    expect(dialog.open()).toBe(true)
    expect(dialog.element.querySelector('.qc-picker-count')?.textContent).toBe('12')
  })
  it('renders personal name/delete anatomy and refuses disabled primary actions', async () => {
    const act = vi.fn(async () => ({ kind: 'ok' as const }))
    const { dialog, pick } = open(source({ act, collections: [{ id: 'host', label: 'Mine', layout: 'list' }], list: async () => ({ kind: 'ok', items: [{ ...item, actions: [{ id: 'edit', label: 'Edit', disabled: true }, { id: 'delete', label: 'Delete' }] }] }) }))
    pick('host'); await settle()
    const name = dialog.element.querySelector<HTMLButtonElement>('[data-picker-item]')!
    expect(name.disabled).toBe(true)
    name.click()
    expect(act).not.toHaveBeenCalled()
    expect(dialog.element.querySelector('.qc-picker-list--personal')).not.toBeNull()
    expect(dialog.element.querySelectorAll('.qc-picker-actions button')).toHaveLength(1)
    expect(dialog.element.querySelector('.qc-picker-actions button')?.getAttribute('aria-label')).toBe('Delete')
  })
  it('declares kinds beside the chart\'s own, and refuses an item of a kind the source never declared', () => {
    expect(pickerKinds(undefined)).toEqual([])
    expect(pickerKinds([{ id: 'study', label: 'Studies' }])).toEqual([{ id: 'study', label: 'Studies' }])
    for (const kinds of [[{ id: 'indicator', label: 'Indicators' }], [{ id: 'study', label: 'Studies' }, { id: 'study', label: 'Again' }], [{ id: 'study', label: '' }], 'study']) expect(pickerKinds(kinds)).toBeNull()
    expect(pickerRows({ kind: 'ok', items: [{ ...item, kind: 'study' }] })).toBeNull()
    expect(pickerRows({ kind: 'ok', items: [{ ...item, kind: 'study' }] }, ['study'])!.items[0]!.kind).toBe('study')
    expect(pickerRows({ kind: 'ok', items: [{ ...item, kind: 'indicator' }] })!.items[0]!.kind).toBe('indicator')
    expect(pickerRows({ kind: 'ok', items: [{ ...item, kind: 7 }] }, ['study'])).toBeNull()
  })
  it.each([[999, '999'], [1234, '1.2 K'], [12567, '13 K']] as const)('formats favorite count %i without using price precision', async (favoriteCount, expected) => {
    const { dialog } = open(source({ list: async () => ({ kind: 'ok', items: [], builtIns: [{ id: 'sma', favoriteCount }] }) }))
    await settle()
    expect(dialog.element.querySelector('.qc-picker-count')?.textContent).toBe(expected)
  })
})

describe('kind filters and the rail', () => {
  const study = { ...item, id: 'band-study', title: 'Band study', kind: 'study' }
  const kinds = [{ id: 'study', label: 'Studies' }]
  const chips = (dialog: { element: HTMLElement }) => [...dialog.element.querySelectorAll<HTMLButtonElement>('.qc-search-class')]
  it('shows no filters while the source declares no kind', async () => {
    const { dialog } = open(source())
    await settle()
    expect(dialog.element.querySelector<HTMLElement>('.qc-search-classes')!.hidden).toBe(true)
  })
  it('offers All, the chart\'s Indicators and each declared kind, and narrows every collection to the one pressed', async () => {
    const { dialog, pick } = open(source({ kinds, collections: [{ id: 'host', label: 'Host', group: 'Personal' }], list: async (request) => ({ kind: 'ok', items: request.collection === 'host' ? [item, study] : [] }) }))
    await settle()
    const strip = dialog.element.querySelector<HTMLElement>('.qc-search-classes')!
    expect(strip.hidden).toBe(false)
    expect(strip.previousElementSibling?.classList.contains('qc-search-field')).toBe(true)
    expect(chips(dialog).map((chip) => [chip.textContent, chip.getAttribute('aria-pressed')])).toEqual([['All', 'true'], ['Indicators', 'false'], ['Studies', 'false']])
    pick('host'); await settle()
    const titles = () => [...dialog.element.querySelectorAll('.qc-picker-name')].map((name) => name.textContent)
    expect(titles()).toEqual(['Example', 'Band study'])
    chips(dialog)[2]!.click()
    expect(titles()).toEqual(['Band study'])
    expect(chips(dialog).map((chip) => chip.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true'])
    chips(dialog)[1]!.click()
    expect(titles()).toEqual(['Example'])
    // With no host rows of its own, the shipped catalog is indicators alone: a declared kind leaves
    // it empty, and says so.
    pick('builtin'); await settle()
    expect(dialog.element.querySelectorAll('[data-indicator]')).toHaveLength(23)
    chips(dialog)[2]!.click()
    expect(dialog.element.querySelectorAll('[data-indicator]')).toHaveLength(0)
    expect(dialog.element.querySelector('[role="status"]')?.textContent).toBe('No matching indicators.')
    chips(dialog)[0]!.click()
    expect(dialog.element.querySelectorAll('[data-indicator]')).toHaveLength(23)
  })
  it('lays the rail out as sections: the host\'s Personal ones, the host\'s other groups, then Technicals under Built-in', async () => {
    const { dialog } = open(source({ collections: [{ id: 'mine', label: 'Mine', group: 'Personal' }, { id: 'shared', label: 'Shared' }, { id: 'picks', label: 'Picks', group: 'Curated' }] }))
    const sections = () => [...dialog.element.querySelectorAll('.qc-picker-section')].map((section) => [section.querySelector('.qc-picker-group')?.textContent, [...section.querySelectorAll('[data-picker-collection]')].map((row) => row.textContent)])
    expect(sections()).toEqual([['Personal', ['Mine', 'Shared']], ['Curated', ['Picks']], ['Built-in', ['Technicals']]])
    expect(dialog.element.querySelector('[data-picker-collection="builtin"]')!.getAttribute('aria-pressed')).toBe('true')
    // A star puts Favorites at the head of Personal.
    await settle()
    dialog.element.querySelector<HTMLButtonElement>('button[aria-label="Favorite Simple Moving Average"]')!.click()
    expect(sections()[0]).toEqual(['Personal', ['Favorites', 'Mine', 'Shared']])
  })
  it('offers Favorites while the host\'s listing carries a starred row', async () => {
    const { dialog } = open(source({ list: async () => ({ kind: 'ok', items: [{ ...item, favorite: true }] }) }))
    expect(dialog.element.querySelector('[data-picker-collection="favorites"]')).toBeNull()
    await settle()
    expect(dialog.element.querySelector('[data-picker-collection="favorites"]')).not.toBeNull()
  })
  it('lists the rows a host answers for Technicals after the shipped definitions, under their kind', async () => {
    const study = { ...item, id: 'band-study', title: 'Band study', kind: 'study' }
    const list = vi.fn(async (request: { collection: string }) => ({ kind: 'ok' as const, items: request.collection === 'builtin' ? [study] : [] }))
    const { dialog } = open(source({ kinds: [{ id: 'study', label: 'Studies' }], list }))
    await settle()
    expect(list.mock.calls[0]?.[0]).toMatchObject({ collection: 'builtin' })
    const titles = () => [...dialog.element.querySelectorAll('.qc-picker-name')].map((name) => name.textContent)
    expect(titles()).toHaveLength(24)
    expect(titles().at(-1)).toBe('Band study')
    dialog.element.querySelectorAll<HTMLButtonElement>('.qc-search-class')[2]!.click()
    expect(titles()).toEqual(['Band study'])
  })
  it('stands the author and count columns only while a listed row fills them', async () => {
    const { dialog, pick } = open(source({ list: async () => ({ kind: 'ok', items: [{ ...item, author: 'Ada', favoriteCount: 3 }] }) }))
    await settle()
    const list = dialog.element.querySelector('.qc-picker-list')!
    expect(list.classList.contains('qc-picker-list--authors')).toBe(true)
    expect(list.classList.contains('qc-picker-list--counts')).toBe(true)
    pick('host'); await settle()
    expect(list.classList.contains('qc-picker-list--authors')).toBe(true)
    expect(dialog.element.querySelector('.qc-picker-author')?.textContent).toBe('Ada')
  })
})

describe('a collection\'s empty state', () => {
  const empty = { title: 'No scripts yet', text: 'Write one to see it here.', icon: { paths: [{ d: 'M4 4H24V24H4Z' }] }, action: { id: 'create', label: 'Create script' } }
  it('refuses a malformed empty state and keeps a valid one', () => {
    expect(pickerCollections([{ id: 'host', label: 'Host', empty }])![0]!.empty).toEqual(empty)
    for (const bad of [{ text: 'No title' }, { title: '' }, { title: 'T', text: 7 }, { title: 'T', action: { id: 'add', label: 'Add' } }, { title: 'T', action: { id: 'go' } }, 'empty']) expect(pickerCollections([{ id: 'host', label: 'Host', empty: bad }])).toBeNull()
  })
  it('stands in the list\'s place while the collection lists nothing, and runs its action on the collection', async () => {
    const act = vi.fn(async () => ({ kind: 'ok' as const, close: true }))
    const { dialog, pick } = open(source({ act, kinds: [{ id: 'study', label: 'Studies' }], collections: [{ id: 'host', label: 'Host', layout: 'list', empty }], list: async () => ({ kind: 'ok', items: [] }) }))
    pick('host'); await settle()
    const vacant = dialog.element.querySelector<HTMLElement>('.qc-picker-empty')!
    expect(vacant.hidden).toBe(false)
    expect(dialog.element.querySelector<HTMLElement>('.qc-picker-list')!.hidden).toBe(true)
    expect(dialog.element.querySelector<HTMLElement>('.qc-search-classes')!.hidden).toBe(true)
    expect(vacant.querySelector('.qc-picker-empty-title')?.textContent).toBe('No scripts yet')
    expect(vacant.querySelector('.qc-picker-empty-text')?.textContent).toBe('Write one to see it here.')
    expect(vacant.querySelector('.qc-picker-empty-mark svg')?.getAttribute('width')).toBe('120')
    expect(vacant.querySelector('.qc-picker-empty-mark svg')?.getAttribute('viewBox')).toBe('0 0 28 28')
    expect(dialog.element.querySelector('[role="status"]')?.textContent).toBe('')
    vacant.querySelector<HTMLButtonElement>('.qc-picker-empty-action')!.click()
    await settle()
    expect(act).toHaveBeenCalledWith({ target: { kind: 'collection', id: 'host' }, action: 'create' }, expect.any(AbortSignal))
    expect(dialog.open()).toBe(false)
  })
  it('gives way to the list and its no-matches line while a search is typed', async () => {
    const { dialog, pick } = open(source({ collections: [{ id: 'host', label: 'Host', empty }], list: async () => ({ kind: 'ok', items: [] }) }))
    pick('host'); await settle()
    const input = dialog.element.querySelector<HTMLInputElement>('.qc-picker-search')!
    input.value = 'zz'; input.dispatchEvent(new Event('input')); await settle()
    expect(dialog.element.querySelector<HTMLElement>('.qc-picker-empty')!.hidden).toBe(true)
    expect(dialog.element.querySelector<HTMLElement>('.qc-picker-list')!.hidden).toBe(false)
    expect(dialog.element.querySelector('[role="status"]')?.textContent).toBe('No matching indicators.')
  })
})

describe('async dialog lifetime', () => {
  it('aborts actions on scope change and discards late close outcomes', async () => {
    const pending = deferred<Awaited<ReturnType<IndicatorPickerSource['act']>>>()
    let signal: AbortSignal | undefined
    const { dialog, pick } = open(source({ act: async (_, next) => { signal = next; return pending.promise } }))
    pick('host'); await settle()
    dialog.element.querySelector<HTMLButtonElement>('[data-picker-item]')!.click()
    pick('builtin'); await settle()
    expect(signal?.aborted).toBe(true)
    pending.resolve({ kind: 'ok', close: true }); await settle()
    expect(dialog.open()).toBe(true)
    expect(dialog.element.querySelectorAll('[data-indicator]')).toHaveLength(23)
  })
  it('rejects malformed outcomes without rendering host error markup', async () => {
    const { dialog, pick } = open(source({ act: async () => ({ kind: 'ok', close: 'yes' } as never) }))
    pick('host'); await settle()
    dialog.element.querySelector<HTMLButtonElement>('[data-picker-item]')!.click(); await settle()
    expect(dialog.open()).toBe(true)
    expect(dialog.element.querySelector('[role="status"]')?.textContent).toContain('could not be completed')
  })
  it('passes queries, aborts the obsolete scope and ignores its late data', async () => {
    const first = deferred<Awaited<ReturnType<IndicatorPickerSource['list']>>>()
    const calls: { collection: string; query: string; signal: AbortSignal }[] = []
    const { dialog, pick } = open(source({ list: async (request, signal) => { calls.push({ ...request, signal }); return calls.length === 1 ? first.promise : { kind: 'ok', items: [{ ...item, title: 'Current' }] } } }))
    pick('host')
    const input = dialog.element.querySelector<HTMLInputElement>('input')!
    input.value = 'query'
    input.dispatchEvent(new Event('input'))
    await settle()
    expect(calls[0]!.signal.aborted).toBe(true)
    expect(calls.at(-1)!.query).toBe('query')
    first.resolve({ kind: 'ok', items: [{ ...item, title: 'Stale' }] })
    await settle()
    expect(dialog.element.textContent).toContain('Current')
    expect(dialog.element.textContent).not.toContain('Stale')
  })
  it('aborts on close and late action success cannot close a reopened dialog', async () => {
    const pending = deferred<Awaited<ReturnType<IndicatorPickerSource['act']>>>()
    let signal: AbortSignal | undefined
    const host = source({ act: async (_, next) => { signal = next; return pending.promise } })
    const first = open(host)
    first.pick('host'); await settle()
    first.dialog.element.querySelector<HTMLButtonElement>('[data-picker-item]')!.click()
    first.dialog.close()
    expect(signal?.aborted).toBe(true)
    const second = open(host)
    pending.resolve({ kind: 'ok', close: true }); await settle()
    expect(second.dialog.open()).toBe(true)
  })
  it('fails actions closed, keeps the dialog alive, and runs one action per row or inner button click', async () => {
    const act = vi.fn(async () => { throw new Error('private detail') })
    const { dialog, pick } = open(source({ act }))
    pick('host'); await settle()
    dialog.element.querySelector<HTMLButtonElement>('[data-picker-item]')!.click()
    await settle()
    expect(act).toHaveBeenCalledTimes(1)
    expect(dialog.open()).toBe(true)
    expect(dialog.element.querySelector('[role="status"]')?.textContent).toContain('could not be completed')
    dialog.element.querySelector<HTMLButtonElement>('button[aria-label="Edit"]')!.click()
    await settle()
    expect(act).toHaveBeenCalledTimes(2)
  })
  it('retains keyboard focus when a favorite redraws, and reopens with its saved preference', () => {
    const { w, dialog, pick } = open()
    const favorite = dialog.element.querySelector<HTMLButtonElement>('button[aria-label="Favorite Simple Moving Average"]')!
    favorite.focus(); favorite.click()
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Unfavorite Simple Moving Average')
    pick('favorites')
    expect(dialog.element.querySelectorAll('[data-indicator]')).toHaveLength(1)
    dialog.close()
    const reopened = openIndicatorPicker({ ...w.ctx, storage: w.storage })
    cleanup.push(() => reopened.close())
    expect(reopened.element.querySelector('button[aria-label="Unfavorite Simple Moving Average"]')).not.toBeNull()
  })
  it('keeps keyboard actions reachable and Escape in the existing dialog owner', async () => {
    const { dialog, pick } = open(source())
    pick('host'); await settle()
    const input = dialog.element.querySelector<HTMLInputElement>('input')!
    input.focus(); press(input, 'ArrowDown')
    expect(document.activeElement?.getAttribute('data-picker-item')).toBe('example')
    const action = dialog.element.querySelector<HTMLButtonElement>('button[aria-label="Edit"]')!
    action.focus(); expect(action.closest('.qc-picker-row')).not.toBeNull()
    press(action, 'Escape'); expect(dialog.open()).toBe(false)
  })
})
