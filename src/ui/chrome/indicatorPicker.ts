// One package-owned browser: shipped definitions and Add stay local; host rows are inert data.
import { BUILT_IN_INDICATORS, type BuiltInIndicator } from '../../builtInIndicators'
import type { ChartExtensionIcon } from '../../extension'
import type { ChartStorage } from '../../storage'
import { commandShown, indicatorPermitted, indicatorShown } from '../../widget/access'
import { indicatorOffered } from '../../widget/offeredIndicators'
import type { IndicatorInstance } from '../../widget/options'
import type { IndicatorPickerAction, IndicatorPickerSource } from '../../widget/indicatorPicker'
import { activeChart, type ChromeContext } from './context'
import { openDialog, type DialogHandle } from './dialog'
import { button, h, items, name, replace, roveFocus } from './dom'
import { ICONS } from '../controls/icons'
import { pickerCollections, pickerRows, type PickerRows } from './indicatorPickerData'
import { buildGlyph } from './vector'
import type { IconResolver } from '../icons/resolver'

export interface IndicatorPickerDeps extends ChromeContext {
  storage?: ChartStorage
  indicatorPicker?: IndicatorPickerSource
  initialCollection?: string
}
const FAVORITES_KEY = 'quickcharts.indicatorFavorites.v1'
// The rows' own marks; a host's glyph goes through the shared inert vector builder instead.
const star = (icons: IconResolver, filled: boolean): HTMLElement => icons.glyph(filled ? ICONS.pickerStarFilled : ICONS.pickerStar, { size: 18 })
const plus = (icons: IconResolver): HTMLElement => icons.glyph(ICONS.plus24, { size: 18 })
const searchGlyph = (icons: IconResolver): HTMLElement => icons.glyph(ICONS.search24, { size: 18 })

export function freshInstanceId(definitionId: string, existing: readonly IndicatorInstance[]): string {
  const taken = new Set(existing.map((i) => i.id))
  let n = 1
  while (taken.has(definitionId + '-' + n)) n++
  return definitionId + '-' + n
}
export function filterDefinitions(t: ChromeContext['i18n']['t'], query: string, definitions: readonly BuiltInIndicator[] = BUILT_IN_INDICATORS): BuiltInIndicator[] {
  const q = query.trim().toLowerCase()
  return q ? definitions.filter((d) => [t(d.nameKey), d.tag, t(d.descriptionKey)].some((text) => text.toLowerCase().includes(q))) : [...definitions]
}

export function openIndicatorPicker(deps: IndicatorPickerDeps): DialogHandle {
  /** Whether the widget offers a built-in: the browser lists only those. */
  const offered = (definition: BuiltInIndicator): boolean => indicatorOffered(deps.builtInIndicators ?? null, definition)
  const t: ChromeContext['i18n']['t'] = (key, ...args) => deps.i18n.t(key, ...args)
  const source = deps.indicatorPicker
  let collections: ReturnType<typeof pickerCollections> = null
  let hostValid = !source
  try {
    collections = source ? pickerCollections(source.collections) : []
    hostValid = collections !== null && (!source || (typeof source.list === 'function' && typeof source.act === 'function'))
  } catch { /* Malformed host metadata cannot break the shipped catalog. */ }
  let favorites: string[] = []
  try {
    const stored: unknown = JSON.parse(deps.storage?.get(FAVORITES_KEY) ?? '[]')
    if (Array.isArray(stored)) favorites = [...new Set(stored.filter((id): id is string => typeof id === 'string' && BUILT_IN_INDICATORS.some((d) => d.id === id)))]
  } catch { /* A preference failure does not prevent using the catalog. */ }
  let query = ''
  let collection = deps.initialCollection === 'favorites' || collections?.some(row => row.id === deps.initialCollection) ? deps.initialCollection! : 'builtin'
  let generation = 0
  let controller: AbortController | null = null
  let busy = false
  let rows: PickerRows = { items: [], builtIns: [] }
  let error = hostValid ? '' : t('picker.unavailable')
  let loading = false
  let available = !source
  let offLocale = (): void => {}
  // The rows as they stand, drawn again: what a change to the host's access policy asks for. The
  // host's listing is not asked again, since the policy is read where the rows are drawn.
  let redraw = (): void => {}
  const cancel = (): void => { generation++; controller?.abort(); controller = null; busy = false }
  return openDialog({
    host: deps.overlays, label: t('picker.title'), className: 'qc-picker-dialog', width: 840,
    refresh: () => redraw(),
    onClose: () => { cancel(); offLocale() },
    build(box, dialog) {
      const input = h('input', { type: 'search', class: 'qc-picker-search', role: 'searchbox', 'aria-label': t('picker.search'), placeholder: t('picker.search'), autocomplete: 'off', spellcheck: 'false' })
      const nav = h('nav', { class: 'qc-picker-nav', 'aria-label': t('picker.collections') })
      const list = h('div', { class: 'qc-picker-list', role: 'table', 'aria-label': t('picker.title') })
      const status = h('div', { class: 'qc-picker-status qc-secondary', role: 'status', 'aria-live': 'polite' })
      const close = button({ label: t('search.close'), icon: deps.icons.glyph(ICONS.dialogClose, { size: 18 }), className: 'qc-dialog-close', onClick: () => dialog.close() })
      let pendingFocus: string | null = null
      const actionButton = (label: string, content: Node | null, run: () => void, disabled = false, focusKey?: string): HTMLButtonElement => {
        const button = h('button', { type: 'button', class: 'qc-picker-action', 'aria-label': label, title: label, 'data-picker-focus': focusKey }, content ?? h('span', {}, label))
        button.disabled = disabled
        button.addEventListener('click', (event) => { event.stopPropagation(); if (!button.disabled) run() })
        return button
      }
      const hostIcon = (icon?: ChartExtensionIcon): HTMLElement | null => {
        const svg = buildGlyph(icon)
        return svg ? h('span', { class: 'qc-picker-host-icon', 'aria-hidden': 'true' }, svg) : null
      }
      const act = async (target: { kind: 'builtin' | 'item'; id: string }, action: string, favorite?: boolean): Promise<void> => {
        if (!source || !hostValid || busy || loading || !dialog.open()) return
        cancel()
        const revision = generation
        const pending = controller = new AbortController()
        busy = true
        error = ''
        render()
        try {
          const result = await source.act({ target, action, ...(favorite !== undefined ? { favorite } : {}) }, pending.signal)
          if (!dialog.open() || revision !== generation) return
          if (result?.kind === 'ok' && (result.close === undefined || typeof result.close === 'boolean')) {
            if (result.close) dialog.close()
            else await refresh()
          } else error = result?.kind === 'refused' && typeof result.message === 'string' && result.message.trim() ? result.message : t('picker.actionFailed')
        } catch {
          if (dialog.open() && revision === generation) error = t('picker.actionFailed')
        } finally {
          if (dialog.open() && revision === generation) { busy = false; render() }
        }
      }
      const add = (definition: BuiltInIndicator): void => {
        if (!dialog.open() || !indicatorPermitted(deps.access, definition)) return
        const chart = activeChart(deps)
        const outcome = deps.commands.execute('chart.indicators.add', { id: freshInstanceId(definition.id, chart.indicators.get()), definition })
        if (outcome.kind !== 'ok') { error = t('picker.notPermitted', { name: t(definition.nameKey) }); render() }
      }
      const toggle = (kind: 'builtin' | 'item', id: string, favorite: boolean, hosted: boolean): void => {
        if (hosted) { void act({ kind, id }, 'favorite', !favorite); return }
        favorites = favorite ? favorites.filter((value) => value !== id) : [...favorites, id]
        try { deps.storage?.set(FAVORITES_KEY, JSON.stringify(favorites)) } catch { /* Keep the in-session preference. */ }
        render()
      }
      const buildRow = (options: { id: string; kind: 'builtin' | 'item'; title: string; description?: string; author?: string; favorite?: boolean; count?: number; hostedFavorite?: boolean; actions: readonly IndicatorPickerAction[]; primary: () => void; permitted: boolean; builtin?: BuiltInIndicator }): HTMLElement => {
        const row = h('div', { class: 'qc-picker-row', role: 'row' })
        const key = (action: string): string => JSON.stringify([options.kind, options.id, action])
        const favoriteCell = h('div', { role: 'cell' })
        if (options.favorite !== undefined) favoriteCell.append(actionButton(t(options.favorite ? 'picker.unfavorite' : 'picker.favorite', { name: options.title }), star(deps.icons, options.favorite), () => toggle(options.kind, options.id, options.favorite!, options.hostedFavorite === true), (options.hostedFavorite === true && (busy || loading)) || (!!source && !available), key('favorite')))
        const label = options.permitted ? options.title : t('picker.notPermitted', { name: options.title })
        const name = h('button', { type: 'button', class: 'qc-picker-name', 'data-qc-item': '', tabindex: '-1', ...(options.builtin ? { 'data-indicator': options.id } : { 'data-picker-item': options.id }), 'aria-label': options.builtin && options.permitted ? t('picker.add', { name: options.title }) : label, title: options.description ?? label }, options.title)
        name.disabled = !options.permitted
        name.dataset.pickerFocus = key('primary')
        if (name.disabled) name.setAttribute('aria-disabled', 'true')
        name.addEventListener('click', () => { if (!name.disabled) options.primary() })
        const actions = h('div', { class: 'qc-picker-actions', role: 'cell' })
        const personal = (collections ?? []).find((entry) => entry.id === collection)?.layout === 'list'
        for (const action of options.actions) {
          // A personal list puts its primary action on the name and keeps only secondary actions
          // in the narrow trailing cell, matching the name/delete anatomy.
          if (personal && rows.items.find((item) => item.id === options.id)?.primaryAction === action.id) continue
          actions.append(actionButton(action.label, hostIcon(action.icon), () => void act({ kind: options.kind, id: options.id }, action.id), busy || loading || action.disabled === true, key('action:' + action.id)))
        }
        if (options.builtin) {
          const button = actionButton(t('picker.add', { name: options.title }), plus(deps.icons), options.primary, !options.permitted, key('add'))
          button.dataset.pickerAdd = options.id
          actions.append(button)
        }
        // Counts are not prices: compact their quantity arithmetically, then use locale digits.
        // Decimal-width policy remains exclusively in the resolved symbol price formatter.
        const total = options.count
        const compact = total === undefined ? 0 : total < 1000 ? total : total < 10000 ? Math.round(total / 100) / 10 : Math.round(total / 1000)
        const count = total === undefined ? '' : new Intl.NumberFormat(deps.i18n.tag()).format(compact) + (total >= 1000 ? t('picker.thousands') : '')
        row.append(favoriteCell, h('div', { role: 'cell', class: 'qc-picker-name-cell' }, name), h('div', { role: 'cell', class: 'qc-picker-author' }, options.author ?? ''), h('div', { role: 'cell', class: 'qc-picker-count' }, count), actions)
        row.addEventListener('click', (event) => { if (options.permitted && !(event.target as Element).closest('button')) options.primary() })
        return row
      }
      const render = (): void => {
        const focused = document.activeElement as HTMLElement | null
        if (focused && list.contains(focused)) pendingFocus = focused.dataset.pickerFocus ?? null
        else if (focused && focused !== document.body) pendingFocus = null
        const selected = (collections ?? []).find((row) => row.id === collection)
        list.classList.toggle('qc-picker-list--personal', selected?.layout === 'list')
        for (const button of nav.querySelectorAll('[data-picker-collection]')) button.setAttribute('aria-pressed', String(button.getAttribute('data-picker-collection') === collection))
        const headings = h('div', { role: 'row', class: 'qc-picker-headings' }, ...['', t('picker.name'), t('picker.author'), t('picker.favorites'), ''].map((label) => h('span', { role: 'columnheader' }, label)))
        const body = h('div', { role: 'rowgroup' })
        if (collection === 'builtin' || collection === 'favorites') {
          for (const definition of filterDefinitions(t, query)) {
            const metadata = rows.builtIns.find((row) => row.id === definition.id)
            const favorite = metadata?.favorite ?? favorites.includes(definition.id)
            if (collection === 'favorites' && !favorite) continue
            // A built-in the host's list leaves out is never listed, whatever the policy says. A host
            // that hides what its policy refuses lists neither a refused definition nor any built-in
            // when it refuses adding one. A starred one keeps its star in storage either way.
            if (!offered(definition)) continue
            if (!indicatorShown(deps.access, definition) || !commandShown(deps.access, 'chart.indicators.add')) continue
            body.append(buildRow({ id: definition.id, kind: 'builtin', title: t(definition.nameKey), description: t(definition.descriptionKey), author: t('picker.builtin'), favorite, count: metadata?.favoriteCount, hostedFavorite: metadata?.favorite !== undefined || (!!source && loading), actions: metadata?.actions ?? [], primary: () => add(definition), permitted: indicatorPermitted(deps.access, definition) && deps.commands.available('chart.indicators.add'), builtin: definition }))
          }
        }
        if (collection !== 'builtin') for (const item of rows.items) {
          if (collection === 'favorites' && item.favorite !== true) continue
          const primary = item.actions.find((action) => action.id === item.primaryAction)!
          body.append(buildRow({ id: item.id, kind: 'item', title: item.title, description: item.description, author: item.author, favorite: item.favorite, count: item.favoriteCount, hostedFavorite: true, actions: item.actions, primary: () => void act({ kind: 'item', id: item.id }, primary.id), permitted: !busy && !loading && !primary.disabled }))
        }
        replace(list, headings, body)
        if (pendingFocus) {
          const target = [...list.querySelectorAll<HTMLButtonElement>('[data-picker-focus]')].find((button) => button.dataset.pickerFocus === pendingFocus)
          if (target && !target.disabled) target.focus()
          else if (!target && !loading && !busy) { pendingFocus = null; input.focus() }
        }
        status.textContent = error || (loading ? t('picker.loading') : body.childElementCount === 0 ? t('picker.noMatches') : '')
        list.setAttribute('aria-busy', String(loading || busy))
      }
      const refresh = async (): Promise<void> => {
        cancel()
        rows = { items: [], builtIns: [] }
        available = !source
        if (!source || !hostValid) { loading = false; error = hostValid ? '' : t('picker.unavailable'); render(); return }
        const revision = generation
        const pending = controller = new AbortController()
        loading = true
        error = ''
        render()
        try {
          const result = await source.list({ collection, query, builtInIds: BUILT_IN_INDICATORS.filter(offered).map((d) => d.id) }, pending.signal)
          if (!dialog.open() || revision !== generation) return
          const parsed = pickerRows(result)
          if (parsed) { rows = parsed; available = true }
          else error = result?.kind === 'unavailable' && typeof result.message === 'string' && result.message.trim() ? result.message : t('picker.unavailable')
        } catch { if (dialog.open() && revision === generation) error = t('picker.unavailable') }
        finally { if (dialog.open() && revision === generation) { loading = false; render() } }
      }
      const renderNavigation = (): void => {
        replace(nav)
        const navigation = [{ id: 'favorites', label: t('picker.favorites'), group: t('picker.personal'), icon: null }, ...(collections ?? []).map((row) => ({ ...row, icon: hostIcon(row.icon) })), { id: 'builtin', label: t('picker.builtin'), group: '', icon: deps.icons.glyph(ICONS.indicators, { size: 28 }) }]
        let group: string | undefined
        for (const item of navigation) {
          if (item.group && item.group !== group) nav.append(h('div', { class: 'qc-picker-group' }, item.group))
          group = item.group
          const button = h('button', { type: 'button', class: 'qc-picker-collection', 'data-picker-collection': item.id }, item.id === 'favorites' ? star(deps.icons, false) : item.icon, h('span', {}, item.label))
          button.addEventListener('click', () => { collection = item.id; void refresh() })
          nav.append(button)
        }
      }
      input.addEventListener('input', () => { query = input.value; void refresh() })
      input.addEventListener('keydown', (event) => { if (event.key === 'ArrowDown' && roveFocus(list, event)) event.preventDefault() })
      list.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowUp' && items(list)[0] === document.activeElement) { event.preventDefault(); input.focus() }
        else if (roveFocus(list, event)) event.preventDefault()
      })
      box.append(h('div', { class: 'qc-picker-header' }, h('span', { class: 'qc-title' }, t('picker.title')), close), h('div', { class: 'qc-picker-searchbar' }, searchGlyph(deps.icons), input), h('div', { class: 'qc-picker-body' }, nav, h('div', { class: 'qc-picker-content' }, h('div', { class: 'qc-picker-tabs' }, h('span', { class: 'qc-picker-tab' }, t('picker.title'))), list, status)))
      renderNavigation()
      redraw = render
      offLocale =deps.i18n.onChange(() => {
        if (!dialog.open()) return
        box.setAttribute('aria-label', t('picker.title'))
        box.querySelector('.qc-title')!.textContent = t('picker.title')
        box.querySelector('.qc-picker-tab')!.textContent = t('picker.title')
        input.placeholder = t('picker.search')
        input.setAttribute('aria-label', t('picker.search'))
        name(close, t('search.close'))
        nav.setAttribute('aria-label', t('picker.collections'))
        list.setAttribute('aria-label', t('picker.title'))
        try {
          collections = source ? pickerCollections(source.collections) : []
          hostValid = collections !== null && (!source || (typeof source.list === 'function' && typeof source.act === 'function'))
        } catch { collections = null; hostValid = false }
        if (!['builtin', 'favorites', ...(collections ?? []).map((row) => row.id)].includes(collection)) collection = 'builtin'
        renderNavigation()
        void refresh()
      })
      void refresh()
    },
    initialFocus: (box) => box.querySelector<HTMLElement>('.qc-picker-search'),
  })
}
