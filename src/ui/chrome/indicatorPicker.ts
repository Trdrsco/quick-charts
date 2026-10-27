// One package-owned indicator picker: shipped definitions and Add stay local; host rows are inert data.
//
// The dialog opens on the search field every search dialog shares, with the kind filters under it
// when the host declares kinds of its own. Below them a rail of collections stands beside the list:
// Favorites under Personal while anything is starred, the host's collections after it under their
// own headings, and the shipped definitions under Built-in, which a host's rows can join. The list
// reads as a table of the star, the name, the author, the count and the row's actions, where the
// author and count columns stand only while a listed row fills them, narrowed to the name and its
// secondary actions for a host's personal list. A host collection that lists nothing can show its
// own empty state: a mark, a title, a line of text and one action.
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
import { INDICATOR_KIND, pickerCollections, pickerKinds, pickerRows, type PickerRows } from './indicatorPickerData'
import { searchClear, searchField } from './searchField'
import { buildGlyph } from './vector'
import type { IconResolver } from '../icons/resolver'

export interface IndicatorPickerDeps extends ChromeContext {
  storage?: ChartStorage
  indicatorPicker?: IndicatorPickerSource
  initialCollection?: string
  /** The kind filter pressed as the picker opens: the chart's `indicator` or a kind the source
   *  declares. Any other value leaves every kind listed. */
  initialKind?: string
}
const FAVORITES_KEY = 'quickcharts.indicatorFavorites.v1'
// The rows' own marks; a host's glyph goes through the shared inert vector builder instead.
const star = (icons: IconResolver, filled: boolean): HTMLElement => icons.glyph(filled ? ICONS.pickerStarFilled : ICONS.pickerStar, { size: 18 })

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
  /** Whether the widget offers a built-in: the picker lists only those. */
  const offered = (definition: BuiltInIndicator): boolean => indicatorOffered(deps.builtInIndicators ?? null, definition)
  const t: ChromeContext['i18n']['t'] = (key, ...args) => deps.i18n.t(key, ...args)
  const source = deps.indicatorPicker
  let collections = null as ReturnType<typeof pickerCollections>
  let kinds = [] as ReturnType<typeof pickerKinds>
  let hostValid = !source
  const readHost = (): void => {
    try {
      collections = source ? pickerCollections(source.collections) : []
      kinds = source ? pickerKinds(source.kinds) : []
      hostValid = collections !== null && kinds !== null && (!source || (typeof source.list === 'function' && typeof source.act === 'function'))
    } catch { collections = null; kinds = null; hostValid = false }
  }
  // Malformed host metadata cannot break the shipped catalog.
  readHost()
  let favorites: string[] = []
  try {
    const stored: unknown = JSON.parse(deps.storage?.get(FAVORITES_KEY) ?? '[]')
    if (Array.isArray(stored)) favorites = [...new Set(stored.filter((id): id is string => typeof id === 'string' && BUILT_IN_INDICATORS.some((d) => d.id === id)))]
  } catch { /* A preference failure does not prevent using the catalog. */ }
  let query = ''
  // Whether the host's last listing carried a starred row: a host that keeps favorites of its own
  // marks them there, and the rail keeps Favorites while it does.
  let hostStarred = false
  /** Whether anything is starred: the rail offers Favorites only then, or while it is open. */
  const starred = (): boolean => favorites.length > 0 || hostStarred
  let collection = (deps.initialCollection === 'favorites' && starred()) || collections?.some(row => row.id === deps.initialCollection) ? deps.initialCollection! : 'builtin'
  // The kind the list is narrowed to, or null for every kind.
  let kind: string | null = deps.initialKind ?? null
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
    // The host's listing is abandoned as the dialog begins to close, not when its exit ends.
    onClosing: () => { cancel(); offLocale() },
    build(box, dialog) {
      const input = h('input', { type: 'text', class: 'qc-search-input qc-picker-search', role: 'searchbox', 'aria-label': t('picker.search'), placeholder: t('picker.search'), autocomplete: 'off', spellcheck: 'false' })
      const clear = searchClear(deps.icons, t('search.clear'), () => { input.value = ''; setQuery(''); input.focus() })
      clear.hidden = true
      const strip = h('div', { class: 'qc-search-classes' })
      const nav = h('nav', { class: 'qc-picker-nav', 'aria-label': t('picker.collections') })
      const list = h('div', { class: 'qc-picker-list', role: 'table', 'aria-label': t('picker.title') })
      // A host collection's empty state stands in the list's place while it lists nothing.
      const vacant = h('div', { class: 'qc-picker-empty' })
      vacant.hidden = true
      // Whether the rail as last built offers Favorites.
      let railFavorites = false
      const status = h('div', { class: 'qc-picker-status qc-secondary', role: 'status', 'aria-live': 'polite' })
      let pendingFocus: string | null = null
      const actionButton = (label: string, content: Node | null, run: () => void, disabled = false, focusKey?: string, className = 'qc-picker-action'): HTMLButtonElement => {
        const button = h('button', { type: 'button', class: className, 'aria-label': label, title: label, 'data-picker-focus': focusKey }, content ?? h('span', {}, label))
        button.disabled = disabled
        button.addEventListener('click', (event) => { event.stopPropagation(); if (!button.disabled) run() })
        return button
      }
      const hostIcon = (icon?: ChartExtensionIcon): HTMLElement | null => {
        const svg = buildGlyph(icon)
        return svg ? h('span', { class: 'qc-picker-host-icon', 'aria-hidden': 'true' }, svg) : null
      }
      const act = async (target: { kind: 'builtin' | 'item' | 'collection'; id: string }, action: string, favorite?: boolean): Promise<void> => {
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
        const favoriteCell = h('div', { role: 'cell', class: 'qc-picker-star-cell' })
        if (options.favorite !== undefined) {
          const toggleStar = actionButton(t(options.favorite ? 'picker.unfavorite' : 'picker.favorite', { name: options.title }), star(deps.icons, options.favorite), () => toggle(options.kind, options.id, options.favorite!, options.hostedFavorite === true), (options.hostedFavorite === true && (busy || loading)) || (!!source && !available), key('favorite'), 'qc-picker-star')
          toggleStar.setAttribute('aria-pressed', String(options.favorite))
          favoriteCell.append(toggleStar)
        }
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
        // Counts are not prices: compact their quantity arithmetically, then use locale digits.
        // Decimal-width policy remains exclusively in the resolved symbol price formatter.
        const total = options.count
        const compact = total === undefined ? 0 : total < 1000 ? total : total < 10000 ? Math.round(total / 100) / 10 : Math.round(total / 1000)
        const count = total === undefined ? '' : new Intl.NumberFormat(deps.i18n.tag()).format(compact) + (total >= 1000 ? t('picker.thousands') : '')
        row.append(favoriteCell, h('div', { role: 'cell', class: 'qc-picker-name-cell' }, name), h('div', { role: 'cell', class: 'qc-picker-author' }, options.author ?? ''), h('div', { role: 'cell', class: 'qc-picker-count' }, count), actions)
        row.addEventListener('click', (event) => { if (options.permitted && !(event.target as Element).closest('button')) options.primary() })
        return row
      }
      /** Whether a row of `rowKind` stands under the kind filter in force. */
      const admitted = (rowKind: string): boolean => kind === null || kind === rowKind
      const render = (): void => {
        const focused = document.activeElement as HTMLElement | null
        if (focused && list.contains(focused)) pendingFocus = focused.dataset.pickerFocus ?? null
        else if (focused && focused !== document.body) pendingFocus = null
        const selected = (collections ?? []).find((row) => row.id === collection)
        list.classList.toggle('qc-picker-list--personal', selected?.layout === 'list')
        if (railFavorites !== (starred() || collection === 'favorites')) renderNavigation()
        for (const button of nav.querySelectorAll('[data-picker-collection]')) button.setAttribute('aria-pressed', String(button.getAttribute('data-picker-collection') === collection))
        for (const chip of strip.querySelectorAll('[data-picker-kind]')) chip.setAttribute('aria-pressed', String((chip.getAttribute('data-picker-kind') || null) === kind))
        const headings = h('div', { role: 'row', class: 'qc-picker-headings' }, ...['', t('picker.name'), t('picker.author'), t('picker.favorites'), ''].map((label) => h('span', { role: 'columnheader' }, label)))
        const body = h('div', { role: 'rowgroup' })
        if ((collection === 'builtin' || collection === 'favorites') && admitted(INDICATOR_KIND)) {
          for (const definition of filterDefinitions(t, query)) {
            const metadata = rows.builtIns.find((row) => row.id === definition.id)
            const favorite = metadata?.favorite ?? favorites.includes(definition.id)
            if (collection === 'favorites' && !favorite) continue
            // A built-in the host's list leaves out is never listed, whatever the policy says. A host
            // that hides what its policy refuses lists neither a refused definition nor any built-in
            // when it refuses adding one. A starred one keeps its star in storage either way.
            if (!offered(definition)) continue
            if (!indicatorShown(deps.access, definition) || !commandShown(deps.access, 'chart.indicators.add')) continue
            body.append(buildRow({ id: definition.id, kind: 'builtin', title: t(definition.nameKey), description: t(definition.descriptionKey), favorite, count: metadata?.favoriteCount, hostedFavorite: metadata?.favorite !== undefined || (!!source && loading), actions: metadata?.actions ?? [], primary: () => add(definition), permitted: indicatorPermitted(deps.access, definition) && deps.commands.available('chart.indicators.add'), builtin: definition }))
          }
        }
        for (const item of rows.items) {
          if (collection === 'favorites' && item.favorite !== true) continue
          if (!admitted(item.kind ?? INDICATOR_KIND)) continue
          const primary = item.actions.find((action) => action.id === item.primaryAction)!
          body.append(buildRow({ id: item.id, kind: 'item', title: item.title, description: item.description, author: item.author, favorite: item.favorite, count: item.favoriteCount, hostedFavorite: true, actions: item.actions, primary: () => void act({ kind: 'item', id: item.id }, primary.id), permitted: !busy && !loading && !primary.disabled }))
        }
        replace(list, headings, body)
        // The author and count columns stand only while a listed row fills them.
        const filled = (cell: string): boolean => [...body.querySelectorAll(cell)].some((node) => node.textContent !== '')
        list.classList.toggle('qc-picker-list--authors', filled('.qc-picker-author'))
        list.classList.toggle('qc-picker-list--counts', filled('.qc-picker-count'))
        const empty = selected?.empty && !loading && available && query.trim() === '' && rows.items.length === 0 ? selected.empty : null
        list.hidden = !!empty
        vacant.hidden = !empty
        // An empty collection has nothing to filter.
        strip.hidden = (kinds ?? []).length === 0 || !!empty
        if (empty) {
          const action = empty.action
          const mark = buildGlyph(empty.icon, 120)
          replace(vacant,
            mark ? h('span', { class: 'qc-picker-empty-mark', 'aria-hidden': 'true' }, mark) : null,
            h('strong', { class: 'qc-picker-empty-title' }, empty.title),
            empty.text ? h('p', { class: 'qc-picker-empty-text' }, empty.text) : null,
            action ? button({ label: action.label, text: action.label, className: 'qc-button--primary qc-drawing-footer-button qc-picker-empty-action', disabled: busy || action.disabled === true, onClick: () => void act({ kind: 'collection', id: collection }, action.id) }) : null)
        } else replace(vacant)
        if (pendingFocus) {
          const target = [...list.querySelectorAll<HTMLButtonElement>('[data-picker-focus]')].find((button) => button.dataset.pickerFocus === pendingFocus)
          if (target && !target.disabled) target.focus()
          else if (!target && !loading && !busy) { pendingFocus = null; input.focus() }
        }
        status.textContent = error || (loading ? t('picker.loading') : body.childElementCount === 0 && !empty ? t('picker.noMatches') : '')
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
          const parsed = pickerRows(result, (kinds ?? []).map((row) => row.id))
          if (parsed) {
            rows = parsed
            available = true
            hostStarred = parsed.builtIns.some((row) => row.favorite === true) || parsed.items.some((item) => item.favorite === true)
          }
          else error = result?.kind === 'unavailable' && typeof result.message === 'string' && result.message.trim() ? result.message : t('picker.unavailable')
        } catch { if (dialog.open() && revision === generation) error = t('picker.unavailable') }
        finally { if (dialog.open() && revision === generation) { loading = false; render() } }
      }
      const setQuery = (next: string): void => {
        query = next
        clear.hidden = next === ''
        void refresh()
      }
      // The rail: Favorites under Personal while anything is starred or while it is open, then the
      // host's collections, each run of one group under its heading (a collection without a group
      // stays in the section above it), then the shipped definitions under Built-in. A host group
      // named as the chart's Personal joins its section.
      const renderNavigation = (): void => {
        replace(nav)
        railFavorites = starred() || collection === 'favorites'
        const personal = t('picker.personal')
        const navigation = [...(railFavorites ? [{ id: 'favorites', label: t('picker.favorites'), group: personal, icon: deps.icons.glyph(ICONS.pickerFavorites, { size: 28 }) }] : []), ...(collections ?? []).map((row) => ({ ...row, icon: hostIcon(row.icon) })), { id: 'builtin', label: t('picker.technicals'), group: t('picker.builtin'), icon: deps.icons.glyph(ICONS.pickerTechnicals, { size: 28 }) }]
        let section: HTMLElement | null = null
        let group: string | undefined
        for (const item of navigation) {
          if (!section || (!!item.group && item.group !== group)) {
            section = h('div', { class: 'qc-picker-section' }, item.group ? h('div', { class: 'qc-picker-group' }, item.group) : null)
            nav.append(section)
            group = item.group
          }
          const button = h('button', { type: 'button', class: 'qc-picker-collection', 'data-picker-collection': item.id }, h('span', { class: 'qc-picker-collection-icon' }, item.icon), h('span', { class: 'qc-picker-collection-label' }, item.label))
          button.addEventListener('click', () => { collection = item.id; void refresh() })
          section.append(button)
        }
      }
      // The kind filters, in the symbol search's class strip: All, the chart's Indicators, then the
      // host's kinds in order. The strip stands only while the host declares a kind.
      const renderKinds = (): void => {
        const declared = kinds ?? []
        if (kind !== null && kind !== INDICATOR_KIND && !declared.some((row) => row.id === kind)) kind = null
        const group = h('div', { class: 'qc-search-class-group', role: 'group', 'aria-label': t('picker.kindFilter') })
        for (const entry of [{ id: '', label: t('picker.allKinds') }, { id: INDICATOR_KIND, label: t('picker.indicators') }, ...declared]) {
          const chip = button({ label: entry.label, text: entry.label, className: 'qc-chip qc-search-class', pressed: (entry.id || null) === kind, onClick: () => { kind = entry.id || null; render() } })
          chip.dataset.pickerKind = entry.id
          group.append(chip)
        }
        replace(strip, group)
        strip.hidden = declared.length === 0
      }
      input.addEventListener('input', () => setQuery(input.value))
      input.addEventListener('keydown', (event) => { if (event.key === 'ArrowDown' && roveFocus(list, event)) event.preventDefault() })
      list.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowUp' && items(list)[0] === document.activeElement) { event.preventDefault(); input.focus() }
        else if (roveFocus(list, event)) event.preventDefault()
      })
      box.append(searchField(deps.icons, input, clear), strip, h('div', { class: 'qc-picker-body' }, nav, h('div', { class: 'qc-picker-content' }, list, vacant, status)))
      renderKinds()
      renderNavigation()
      redraw = render
      offLocale = deps.i18n.onChange(() => {
        if (!dialog.open()) return
        box.setAttribute('aria-label', t('picker.title'))
        input.placeholder = t('picker.search')
        input.setAttribute('aria-label', t('picker.search'))
        name(clear, t('search.clear'))
        nav.setAttribute('aria-label', t('picker.collections'))
        list.setAttribute('aria-label', t('picker.title'))
        readHost()
        if (!['builtin', 'favorites', ...(collections ?? []).map((row) => row.id)].includes(collection)) collection = 'builtin'
        renderKinds()
        renderNavigation()
        void refresh()
      })
      void refresh()
    },
    initialFocus: (box) => box.querySelector<HTMLElement>('.qc-picker-search'),
  })
}
