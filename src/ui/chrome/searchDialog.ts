// The symbol search dialog: one dialog, three modes. `search` picks the active chart's symbol;
// `compare` adds and removes comparisons and stays open, its empty-query view listing the added
// symbols over the recent ones; `change-symbol` is search with the current symbol prefilled,
// returning the pick to whoever asked. The search itself is the chart's controller (debounce,
// cache, cancellation, paging); the dialog renders its state and never invents a row.
//
// Keyboard: the field keeps focus; ArrowUp and ArrowDown move the active row (prefetching the
// next page as the highlight nears the end); Enter acts on it; Escape closes. The list is a
// listbox the field controls through `aria-activedescendant`, so a screen reader hears the row
// under the highlight without focus leaving the field.
import type { ChartDatafeed, SymbolRow } from '../../datafeed'
import type { ChartI18n, ChartMessageKey } from '../../i18n'
import type { CompareEntry, ComparePlacement, CompareSymbol } from '../../compare'
import { createSearchController, isSymbolPair, looksLikeSpread, matchSegments, SPREAD_OPERATORS, spreadExpression, spreadSearchQuery, type RecentsPort } from '../../search'
import type { CommandRegistry } from '../../widget/commands'
import type { SearchRequest } from './doors'
import { dialogTitle, openDialog, type DialogHandle } from './dialog'
import { append, button, glyph, h, name, replace, setDisabled } from './dom'
import { ICONS, OPERATOR_GLYPHS } from './icons'

export interface SearchDialogDeps {
  host: HTMLElement
  i18n: ChartI18n
  datafeed: ChartDatafeed
  commands: CommandRegistry
  recents: RecentsPort
  /** The asset classes the feed declares, or null for no filter strip. */
  classes(): readonly string[] | null
  /** Display names for those classes, from the host. A class without one wears its token. */
  classNames?: Readonly<Record<string, string>>
  /** Curated quick-add rows for compare mode, above the recents. */
  curated: readonly CompareSymbol[]
  request: SearchRequest
}

/** The three placements a compare row adds at, in button order. */
const PLACEMENTS: readonly { placement: ComparePlacement; label: ChartMessageKey }[] = [
  { placement: 'same-percent', label: 'search.samePercent' },
  { placement: 'new-scale', label: 'search.newScale' },
  { placement: 'new-pane', label: 'search.newPane' },
]

/** One row the list can render: a search hit, a recent, a curated pick, or an added compare
 *  surfaced for removal. */
export interface DialogRow {
  row: SymbolRow
  added: boolean
}

/** The flat row model for a mode, query and controller state. Pure, so the list a viewer sees
 *  and the list a test asserts are one computation. */
export function dialogRows(input: {
  mode: SearchRequest['mode']
  query: string
  hits: readonly SymbolRow[]
  loading: boolean
  recents: readonly SymbolRow[]
  curated: readonly CompareSymbol[]
  added: readonly CompareEntry[]
}): DialogRow[] {
  const q = input.query.trim()
  const addedSet = new Set(input.added.map((e) => e.symbol))
  const compare = input.mode === 'compare'
  if (compare && q === '') {
    const added: DialogRow[] = input.added.map((e) => ({ row: { symbol: e.symbol, name: '', exchange: '', type: '' }, added: true }))
    const seen = new Set(addedSet)
    const curated: DialogRow[] = []
    for (const c of input.curated) {
      if (seen.has(c.symbol)) continue
      seen.add(c.symbol)
      curated.push({ row: { symbol: c.symbol, name: c.title, exchange: '', type: '' }, added: false })
    }
    const recent: DialogRow[] = input.recents.filter((r) => !seen.has(r.symbol)).map((row) => ({ row, added: false }))
    return [...added, ...curated, ...recent]
  }
  const base: DialogRow[] = input.hits.map((row) => ({ row, added: addedSet.has(row.symbol) }))
  if (!compare && q === '') {
    const seen = new Set(input.recents.map((r) => r.symbol))
    return [...input.recents.map((row) => ({ row, added: addedSet.has(row.symbol) })), ...base.filter((r) => !seen.has(r.row.symbol))]
  }
  // A query reading as a spread EXPRESSION leads with the exact expression; catalog matches on its
  // stripped ticker follow. A plain slash pair is catalog identity and offers a spread row only
  // once the search settled with no hits, because a listed market outranks arithmetic.
  const expression = looksLikeSpread(q) && !isSymbolPair(q)
  if (expression) {
    const expr = spreadExpression(q)
    if (!base.some((r) => r.row.symbol.toUpperCase() === expr)) base.unshift({ row: { symbol: expr, name: expr, exchange: '', type: 'spread' }, added: addedSet.has(expr) })
  } else if (looksLikeSpread(q) && !input.loading && base.length === 0) {
    const expr = spreadExpression(q)
    base.push({ row: { symbol: expr, name: expr, exchange: '', type: 'spread' }, added: addedSet.has(expr) })
  }
  return base
}

/** How many rows from the end the highlight may reach before the next page is pulled. */
const PREFETCH_MARGIN = 8

export function openSearchDialog(deps: SearchDialogDeps): DialogHandle {
  const t = deps.i18n.t
  const { request, commands } = deps
  const mode = request.mode
  const compare = mode === 'compare'
  const chart = request.chart
  const search = createSearchController(deps.datafeed, { pageSize: 50 })
  let query = request.changeFrom ?? ''
  let cls = ''
  let active = 0
  let rows: DialogRow[] = []
  let opsOpen = true

  const title = mode === 'compare' ? t('search.compareTitle') : mode === 'change-symbol' ? t('search.changeSymbolTitle') : t('search.title')
  let observer: IntersectionObserver | null = null

  const dialog = openDialog({
    host: deps.host,
    label: title,
    className: `qc-search-dialog qc-search-dialog--${mode}`,
    width: 840,
    onClose: () => {
      search.dispose()
      observer?.disconnect()
    },
    build(box, handle) {
      const input = h('input', { type: 'text', role: 'combobox', class: 'qc-search-input', 'aria-label': t('search.placeholder'), placeholder: t('search.placeholder'), autocomplete: 'off', 'aria-autocomplete': 'list', 'aria-expanded': 'true', 'aria-controls': 'qc-search-list', spellcheck: 'false', value: query })
      const clear = button({ label: t('search.clear'), icon: ICONS.clear, iconSize: 18, className: 'qc-search-op', onClick: () => setQuery('') })
      clear.hidden = query === ''
      const ops = h('span', { class: 'qc-search-ops', role: 'group', 'aria-label': t('search.opsShow') })
      const opButtons: HTMLButtonElement[] = []
      const opsToggle = button({
        label: t('search.opsHide'),
        icon: ICONS.plus,
        iconSize: 18,
        className: 'qc-search-op',
        pressed: true,
        onClick: () => {
          opsOpen = !opsOpen
          for (const b of opButtons) b.hidden = !opsOpen
          opsToggle.setAttribute('aria-pressed', String(opsOpen))
          name(opsToggle, t(opsOpen ? 'search.opsHide' : 'search.opsShow'))
        },
      })
      if (!compare) {
        for (const op of SPREAD_OPERATORS) {
          const b = button({
            label: t(op.label),
            className: 'qc-search-op',
            onClick: () => {
              setQuery(op.prefix ? `${op.insert}${query}` : `${query}${op.insert}`)
              input.focus()
            },
          })
          b.appendChild(glyph(OPERATOR_GLYPHS[op.id], { size: 13, viewBox: '0 0 13 13' }))
          opButtons.push(b)
          ops.appendChild(b)
        }
        ops.appendChild(opsToggle)
      }
      const field = h('div', { class: 'qc-search-field' }, glyph(ICONS.search, { size: 18, className: 'qc-search-magnifier' }), input, clear, compare ? null : ops)

      // The asset-class strip, search family only: chips that narrow the feed's answer.
      const classes = compare ? null : deps.classes()
      let strip: HTMLElement | null = null
      const classChips = new Map<string, HTMLButtonElement>()
      if (classes && classes.length > 0) {
        strip = h('div', { class: 'qc-search-classes', role: 'group', 'aria-label': t('search.classFilter') })
        const all = [{ id: '', label: t('search.allClasses') }, ...classes.map((id) => ({ id, label: deps.classNames?.[id] ?? id }))]
        for (const c of all) {
          const chip = button({
            label: c.label,
            text: c.label,
            className: 'qc-chip qc-search-class',
            pressed: c.id === cls,
            onClick: () => {
              cls = c.id
              for (const [id, b] of classChips) b.setAttribute('aria-pressed', String(id === cls))
              active = 0
              search.search(serverQuery(), cls)
              render()
            },
          })
          classChips.set(c.id, chip)
          strip.appendChild(chip)
        }
      }

      const list = h('div', { class: 'qc-search-list', role: 'listbox', id: 'qc-search-list', 'aria-label': t('search.results') })
      const status = h('div', { class: 'qc-search-status qc-secondary', role: 'status', 'aria-live': 'polite' })
      const sentinel = h('div', { class: 'qc-search-sentinel qc-muted' }, t('search.loadingMore'))
      sentinel.hidden = true
      append(box, dialogTitle(title, t('search.close'), () => handle.close()), field, strip, list, status)

      const serverQuery = (): string => (looksLikeSpread(query) && !isSymbolPair(query) ? spreadSearchQuery(query) : query)
      const setQuery = (next: string): void => {
        query = next
        input.value = next
        clear.hidden = next === ''
        active = 0
        if (compare && next.trim() === '') render()
        else search.search(serverQuery(), cls)
        render()
      }

      const remember = (row: SymbolRow): void => deps.recents.promote(row)
      const act = (entry: DialogRow, placement: ComparePlacement = 'same-percent'): void => {
        const row = entry.row
        if (compare) {
          if (entry.added) commands.execute('chart.compare.remove', row.symbol)
          else {
            remember(row)
            commands.execute('chart.compare.add', { symbol: row.symbol, placement })
          }
          render()
          return
        }
        if (mode === 'change-symbol' && request.onPick) {
          remember(row)
          request.onPick(row.symbol)
          handle.close()
          return
        }
        // A refused command leaves the dialog where it is: nothing happened, so nothing closes.
        if (commands.execute('chart.symbol.set', row.symbol).kind !== 'ok') return
        remember(row)
        handle.close()
      }

      const rowId = (i: number): string => `qc-search-row-${i}`
      const marked = (text: string): HTMLElement => {
        const span = h('span', { class: 'qc-search-symbol' })
        for (const seg of matchSegments(text, serverQuery())) span.appendChild(h('span', { class: seg.hit ? 'qc-search-hit' : undefined }, seg.text))
        return span
      }

      const render = (): void => {
        const state = search.state()
        const settled = state.query.trim() === serverQuery().trim()
        rows = dialogRows({ mode, query, hits: settled ? state.hits : [], loading: state.loading || !settled, recents: deps.recents.list(), curated: deps.curated, added: chart.compare.list() })
        active = Math.max(0, Math.min(active, rows.length - 1))
        const emptyStack = compare && query.trim() === ''
        const addedCount = emptyStack ? chart.compare.list().length : 0
        const children: (HTMLElement | null)[] = []
        rows.forEach((entry, i) => {
          if (emptyStack && i === 0 && addedCount > 0) children.push(h('div', { class: 'qc-dialog-heading', role: 'presentation' }, t('search.added')))
          if (emptyStack && i === addedCount && rows.length > addedCount) children.push(h('div', { class: 'qc-dialog-heading', role: 'presentation' }, t('search.recent')))
          const r = entry.row
          const option = h('div', { class: 'qc-search-row', role: 'option', id: rowId(i), 'aria-selected': String(i === active), 'data-symbol-row': r.symbol, tabindex: '-1' })
          option.appendChild(h('span', { class: 'qc-search-text' }, marked(r.symbol), r.name ? h('span', { class: 'qc-search-name qc-secondary' }, r.name) : null))
          if (compare) {
            if (entry.added) {
              const mark = h('span', { class: 'qc-search-added qc-secondary', title: t('search.addedMark', { symbol: r.symbol }) })
              mark.appendChild(glyph(ICONS.check, { size: 18 }))
              option.appendChild(mark)
            } else {
              const actions = h('span', { class: 'qc-search-actions' })
              for (const p of PLACEMENTS) {
                actions.appendChild(
                  button({
                    label: t(p.label),
                    text: t(p.label),
                    className: 'qc-chip',
                    onClick: (e) => {
                      e.stopPropagation()
                      act(entry, p.placement)
                    },
                  }),
                )
              }
              option.appendChild(actions)
            }
          } else {
            option.appendChild(h('span', { class: 'qc-search-meta qc-muted' }, [r.type, r.exchange].filter(Boolean).join(' ')))
          }
          option.addEventListener('mouseenter', () => setActive(i))
          option.addEventListener('click', () => act(entry))
          children.push(option)
        })
        replace(list, ...children)
        if (!emptyStack && settled && !state.loading && !state.failed && state.hasMore && rows.length > 0) {
          sentinel.hidden = false
          list.appendChild(sentinel)
          observer?.observe(sentinel)
        } else sentinel.hidden = true
        if (emptyStack && rows.length === 0) status.textContent = t('search.compareEmpty')
        else if (state.failed) status.textContent = t('search.failed')
        else if (rows.length === 0 && settled && !state.loading) status.textContent = t('search.noMatches')
        else status.textContent = ''
        input.setAttribute('aria-activedescendant', rows.length > 0 ? rowId(active) : '')
      }
      const setActive = (i: number): void => {
        if (i === active) return
        list.querySelector(`#${rowId(active)}`)?.setAttribute('aria-selected', 'false')
        active = i
        const el = list.querySelector<HTMLElement>(`#${rowId(active)}`)
        el?.setAttribute('aria-selected', 'true')
        el?.scrollIntoView?.({ block: 'nearest' })
        input.setAttribute('aria-activedescendant', rowId(active))
      }

      input.addEventListener('input', () => setQuery(input.value))
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          if (search.state().hasMore && active >= rows.length - PREFETCH_MARGIN) search.loadMore()
          setActive(Math.min(active + 1, rows.length - 1))
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          setActive(Math.max(active - 1, 0))
        } else if (e.key === 'Enter') {
          const entry = rows[active]
          if (entry) act(entry)
        }
      })
      // Paging: the sentinel below the last row pulls the next page as it scrolls into view, and
      // keeps pulling while it stays there as pages land, so the whole catalog is reachable.
      observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver((entries) => entries.some((en) => en.isIntersecting) && search.loadMore(), { root: list }) : null
      search.subscribe(render)
      render()
      if (!compare || query.trim() !== '') search.search(serverQuery(), cls)
      if (request.changeFrom) input.select()
      // The strip's chips reflect the strip's state, which starts at every class.
      setDisabled(clear, false)
    },
    initialFocus: (box) => box.querySelector<HTMLElement>('.qc-search-input'),
  })
  return dialog
}
