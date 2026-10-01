// The symbol search dialog: one dialog, three modes. `search` picks the active chart's symbol;
// `compare` adds and removes comparisons and stays open, its empty-query view listing the added
// symbols over the recent ones; `change-symbol` is search with the current symbol prefilled,
// returning the pick to whoever asked. The search itself is the chart's controller (debounce,
// cache, cancellation, paging); the dialog renders its state and never invents a row.
//
// Keyboard: the field keeps focus; ArrowUp and ArrowDown move the active row (prefetching the
// next page as the highlight nears the end); Enter acts on it, or on the top row before an arrow
// has moved; Escape closes. The list is a listbox the field controls through
// `aria-activedescendant`, so a screen reader hears the row under the highlight without focus
// leaving the field. The pointer only hovers: it never moves the keyboard's row.
import type { SearchClassNode, SymbolRow } from '../../datafeed'
import type { ChartI18n, ChartMessageKey } from '../../i18n'
import type { CompareEntry, ComparePlacement, CompareSymbol } from '../../compare'
import { isSymbolPair, looksLikeSpread, matchSegments, SPREAD_OPERATORS, spreadExpression, spreadSearchQuery, type RecentsPort, type SearchClassFilter, type SearchSession, type SpreadOperator } from '../../search'
import type { CommandRegistry } from '../../widget/commands'
import type { SearchDisplayOptions, SearchScope } from '../../widget/options'
import type { SearchRequest } from './doors'
import { dialogTitle, emptyState, openDialog, type DialogHandle } from './dialog'
import { classBranches, classSelection } from './searchClasses'
import { append, button, h, name, reglyph, replace, setDisabled } from './dom'
import { COMPARE_EMPTY_MARK, ICONS, OPERATOR_GLYPHS } from '../controls/icons'
import { createSymbolBadge } from './symbolBadge'
import { symbolNames } from '../../symbolLabel'
import type { MarkPainters } from '../../markPainters'
import type { IconResolver } from '../icons/resolver'

export interface SearchDialogDeps {
  host: HTMLElement
  i18n: ChartI18n
  /** Draws every glyph: the host's drawing for its icon, or the chart's own. */
  icons: IconResolver
  search: SearchSession
  /** The registry the chart-acting modes execute through. The standalone pick has none: it acts on
   *  nobody and hands its answer back instead. */
  commands?: CommandRegistry
  recents: RecentsPort
  /** The asset classes the feed declares, or null for no filter strip. */
  classes(): readonly (string | SearchClassNode)[] | null
  /** Display names for those classes, from the host. A class without one wears its token. */
  classNames?: Readonly<Record<string, string>>
  /** How the host has the classes and the spread operators offered. Absent is the default search. */
  display?: SearchDisplayOptions
  /** What the search is limited to, named at the far edge of the class strip with the host's mark. */
  scope?: () => SearchScope | null
  /** The host's mark painters: the same value the legend paints its badge with. A row wears the
   *  market's, and its source cell the venue's, or the data provider's where it names no venue.
   *  Where the host lent none, a row wears the neutral monogram and the source its initial on the
   *  package's own disc. */
  painters: MarkPainters
  /** Curated quick-add rows for compare mode, above the recents. */
  curated?: readonly CompareSymbol[]
  request: SearchRequest
  onClose?(dialog: DialogHandle): void
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

/** How one row is WRITTEN: the market's mark in the ticker cell, its description beside it, and
 *  its source.
 *
 *  The mark and the description are the names every surface gives a market (`symbolNames`): a
 *  pair market reads `ETHUSDC` beside `ETH / USDC`, in the terms it trades in, where "Ethereum
 *  perpetual" names the contract and leaves out what it is priced in; a market that is not a pair
 *  wears its bare ticker beside the feed's own name. The venue prefix is routing identity and never
 *  reaches a cell. A spread's expression IS its identity, operators and all, so it passes through
 *  untouched. A row reads here as the same market reads once it is on the chart: the pill wears
 *  the same mark and the legend the same pair.
 *
 *  The source is the VENUE when the row names one, because that is the feed the row charts off,
 *  and the publisher otherwise. A row with neither says nothing rather than borrowing a name. */
export function rowLabels(row: SymbolRow): { ticker: string; description: string; source: string } {
  const names = symbolNames(row)
  return { ticker: names.mark, description: names.description, source: row.exchange || row.provider || '' }
}

/** The operators a search offers for the host's `spreads` option: every one by default, none with
 *  spreads off, and otherwise the listed ones in the listed order, each once. */
export function offeredOperators(spreads: SearchDisplayOptions['spreads']): readonly SpreadOperator[] {
  if (spreads === false) return []
  if (spreads === undefined || spreads === true) return SPREAD_OPERATORS
  const out: SpreadOperator[] = []
  for (const id of spreads.operators) {
    const op = SPREAD_OPERATORS.find((o) => o.id === id)
    if (op && !out.includes(op)) out.push(op)
  }
  return out
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
  /** Whether a query may read as a spread expression. Default true. */
  spreads?: boolean
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
  // once the search settled with no hits, because a listed market outranks arithmetic. With spreads
  // off, a query is only ever a catalog question.
  if (input.spreads === false) return base
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

/** The box a row's mark stands in, paired with the width the stylesheet gives it. The package owns
 *  the geometry and tells the host, rather than the host guessing and being boxed inside it. */
const ROW_MARK_SIZE = 24
/** The source cell's mark: an 18px disc in a 20px cell. */
const SOURCE_MARK_SIZE = 18

/** How many picks have opened without a chart in this document, so their row ids never collide. */
let picks = 0

/** How many rows from the end the highlight may reach before the next page is pulled. */
const PREFETCH_MARGIN = 8

/** What the list has to say: its rows, that a settled question found nothing, or that the feed failed. */
type StatusKind = 'rows' | 'none' | 'failed'

/** What a frame hands the surface: the title it wears, if any, and what closing it means. A dialog
 *  writes its own title and closes itself; the phone's card is the picker itself and wears none. */
export interface SearchFrame {
  title: string | null
  done(): void
}

/** What a frame holds on to: the surface stops its feed work and takes down the host's marks when
 *  its frame goes. */
export interface SearchSurface {
  teardown(): void
}

/** The search itself, built into `box`: the field, the class strip, the operator strip and the
 *  list, over the controller, the recents and the marks the deps carry. Every frame builds this
 *  one surface, so a market reads and behaves the same in a dialog, in a chart and on a phone. */
export function buildSearchSurface(deps: SearchDialogDeps, box: HTMLElement, frame: SearchFrame): SearchSurface {
  const t = deps.i18n.t
  const { request, commands } = deps
  const mode = request.mode
  const compare = mode === 'compare'
  const chart = request.chart ?? null
  // Ids carry the chart id, or the count of picks opened without one, so two dialogs in one
  // document never share one.
  const scope = chart ? chart.id : `pick-${(picks += 1)}`
  const listId = `qc-search-${scope}-list`
  const search = deps.search.controller
  // Search and pick list their markets as a table; the compare family lists them as cards.
  if (mode === 'search' || mode === 'pick') box.classList.add('qc-search-table')
  let query = request.changeFrom ?? ''
  const display = deps.display ?? {}
  // Spreads off, a query is only a catalog question: no operator, no expression row, and the feed
  // hears the query as typed. The compare family never offers the operators.
  const spreads = display.spreads !== false
  const operators = compare ? [] : offeredOperators(display.spreads)
  const offerOps = operators.length > 0
  // The row the keyboard stands on, or -1 before an arrow has moved it: a list opens with no row
  // claimed. A prefilled query stands on its first answer, because the viewer arrived holding it.
  let active = request.changeFrom ? 0 : -1
  let rows: DialogRow[] = []
  // The operators open on request: most searches are a ticker, and arithmetic is a second step.
  let opsOpen = false

  let observer: IntersectionObserver | null = null
  /** What takes the host's marks down again. The list is rebuilt on every render and on close, so a
   *  host that hands back a disposer never has one outlive the row it painted into. */
  let markDisposers: (() => void)[] = []
  const releaseMarks = (): void => {
    const drops = markDisposers
    markDisposers = []
    for (const drop of drops) drop()
  }
  /** What takes the scope's mark down. The scope sits in the class strip, which lives as long as the
   *  surface, so its mark is released on teardown and never with the rows a render replaces. */
  let scopeMarkDisposer: (() => void) | null = null

    const input = h('input', { type: 'text', role: 'combobox', class: 'qc-search-input', 'aria-label': t('search.placeholder'), placeholder: t('search.placeholder'), autocomplete: 'off', 'aria-autocomplete': 'list', 'aria-expanded': 'true', 'aria-controls': listId, spellcheck: 'false', value: query })
    const clear = button({ label: t('search.clear'), icon: deps.icons.glyph(ICONS.clear, { size: 18 }), className: 'qc-search-op', onClick: () => setQuery('') })
    // The rule parts the clear mark from what follows it, so the two come and go together.
    const rule = offerOps ? h('span', { class: 'qc-search-rule', 'aria-hidden': 'true' }) : null
    const showClear = (shown: boolean): void => {
      clear.hidden = !shown
      if (rule) rule.hidden = !shown
    }
    showClear(query !== '')
    const opsId = `qc-search-${scope}-ops`
    const ops = h('span', { class: 'qc-search-ops', id: opsId, role: 'group', 'aria-label': t('search.ops') })
    const opsToggle = button({ label: t('search.opsShow'), icon: deps.icons.glyph(ICONS.spreadOpsShow, { size: 18 }), className: 'qc-search-op', onClick: () => setOps(!opsOpen) })
    opsToggle.setAttribute('aria-controls', opsId)
    // The toggle names what it will do and says whether the strip is out; its chevron points the
    // way the strip will move.
    const setOps = (open: boolean): void => {
      opsOpen = open
      ops.hidden = !open
      opsToggle.setAttribute('aria-expanded', String(open))
      name(opsToggle, t(open ? 'search.opsHide' : 'search.opsShow'))
      reglyph(opsToggle, deps.icons, open ? ICONS.spreadOpsHide : ICONS.spreadOpsShow, { size: 18 })
    }
    if (offerOps) {
      for (const op of operators) {
        const b = button({
          label: t(op.label),
          className: 'qc-search-op',
          onClick: () => {
            setQuery(op.prefix ? `${op.insert}${query}` : `${query}${op.insert}`)
            input.focus()
          },
        })
        b.appendChild(deps.icons.glyph(OPERATOR_GLYPHS[op.id], { size: 13 }))
        ops.appendChild(b)
      }
      setOps(opsOpen)
    }
    // The field's trailing strip, in the order a hand reaches for it: the clear mark for the query
    // that is there, a hairline, the operators when they are out, and the toggle that brings them.
    // The rule belongs to the strip rather than to the operator group, so it is a mark of its own
    // height rather than a border running the full depth of the field.
    const actions = h('span', { class: 'qc-search-actions-field' }, clear, rule, offerOps ? ops : null, offerOps ? opsToggle : null)
    const field = h('div', { class: 'qc-search-field' }, deps.icons.glyph(ICONS.search, { size: 28, className: 'qc-search-magnifier' }), input, actions)

    // The asset-class strip, search family only: chips that narrow the feed's answer. A class that
    // holds narrower classes offers them in a row of their own beneath the strip while it is
    // selected, opening with its all chip: the feed hears the child where one is picked, and the
    // class where none is. Every row is a group of pressed buttons in the tab order.
    const classes = compare ? null : deps.classes()
    const branches = classes ? classBranches(classes) : []
    const allShown = display.allClasses !== false
    const allLabel = display.allClasses ? display.allClasses.label : t('search.allClasses')
    const labelOf = (id: string): string => deps.classNames?.[id] ?? id
    const selection = classSelection(branches, { multiple: display.classSelection === 'multiple', all: allShown })
    let cls: SearchClassFilter = selection.filter()
    let strip: HTMLElement | null = null
    const narrower: { row: HTMLElement; top: string }[] = []
    const chips: { chip: HTMLButtonElement; pressed(): boolean }[] = []
    const reflect = (): void => {
      for (const { chip, pressed } of chips) chip.setAttribute('aria-pressed', String(pressed()))
      for (const { row, top } of narrower) row.hidden = !selection.has(top)
      cls = selection.filter()
      active = -1
      search.search(serverQuery(), cls)
      render()
    }
    const classChip = (label: string, pressed: () => boolean, pick: () => void): HTMLButtonElement => {
      const chip = button({ label, text: label, className: 'qc-chip qc-search-class', pressed: pressed(), onClick: () => (pick(), reflect()) })
      chips.push({ chip, pressed })
      return chip
    }
    const searchScope = deps.scope?.() ?? null
    if (branches.length > 0 || searchScope) {
      strip = h('div', { class: 'qc-search-classes', role: 'group', 'aria-label': t('search.classFilter') })
      if (allShown && branches.length > 0) strip.appendChild(classChip(allLabel, () => selection.isAll(), () => selection.clear()))
      for (const branch of branches) {
        strip.appendChild(classChip(labelOf(branch.id), () => selection.has(branch.id), () => selection.pickTop(branch.id)))
        if (branch.children.length === 0) continue
        const row = h('div', { class: 'qc-search-classes qc-search-subclasses', role: 'group', 'aria-label': labelOf(branch.id) })
        row.appendChild(classChip(allLabel, () => selection.has(branch.id) && !selection.narrowed(branch.id), () => selection.clearChildren(branch.id)))
        for (const child of branch.children) row.appendChild(classChip(labelOf(child), () => selection.hasChild(branch.id, child), () => selection.pickChild(branch.id, child)))
        row.hidden = !selection.has(branch.id)
        narrower.push({ row, top: branch.id })
      }
      if (searchScope) {
        const mark = h('span', { class: 'qc-search-scope-mark', 'aria-hidden': 'true' })
        const drop = searchScope.mark?.({ host: mark, size: SOURCE_MARK_SIZE })
        if (typeof drop === 'function') {
          mark.dataset.qcHost = 'true'
          scopeMarkDisposer = drop
        } else if (mark.childNodes.length === 0) mark.textContent = searchScope.label.charAt(0).toUpperCase()
        strip.appendChild(h('span', { class: 'qc-search-scope', 'aria-label': searchScope.label }, mark, h('span', {}, searchScope.label)))
      }
    }

    const list = h('div', { class: 'qc-search-list', role: 'listbox', id: listId, 'aria-label': t('search.results') })
    // Where the list says it has nothing to show: empty, it takes no room; with an answer to give,
    // it stands in the list's place.
    const status = h('div', { class: 'qc-search-status', role: 'status', 'aria-live': 'polite' })
    const sentinel = h('div', { class: 'qc-search-sentinel qc-muted' }, t('search.loadingMore'))
    sentinel.hidden = true
    append(box, frame.title === null ? null : dialogTitle(frame.title, t('search.close'), frame.done, deps.icons), field, strip, ...narrower.map((n) => n.row), list, status)

    const serverQuery = (): string => (spreads && looksLikeSpread(query) && !isSymbolPair(query) ? spreadSearchQuery(query) : query)
    const setQuery = (next: string): void => {
      query = next
      input.value = next
      showClear(next !== '')
      active = -1
      if (compare && next.trim() === '') deps.search.cancelPending()
      else search.search(serverQuery(), cls)
      render()
    }

    const remember = (row: SymbolRow): void => deps.recents.promote(row)
    const act = (entry: DialogRow, placement: ComparePlacement = 'same-percent'): void => {
      const row = entry.row
      if (compare) {
        if (entry.added) commands?.execute('chart.compare.remove', row.symbol)
        else {
          remember(row)
          commands?.execute('chart.compare.add', { symbol: row.symbol, placement })
        }
        render()
        return
      }
      if (request.onPick) {
        remember(row)
        request.onPick(row.symbol)
        frame.done()
        return
      }
      // A refused command leaves the dialog where it is: nothing happened, so nothing closes.
      if (!commands || commands.execute('chart.symbol.set', row.symbol).kind !== 'ok') return
      remember(row)
      frame.done()
    }

    const rowId = (i: number): string => `qc-search-${scope}-row-${i}`
    const marked = (text: string): HTMLElement => {
      const span = h('span', { class: 'qc-search-symbol' })
      for (const seg of matchSegments(text, serverQuery())) span.appendChild(h('span', { class: seg.hit ? 'qc-search-hit' : undefined }, seg.text))
      return span
    }

    const render = (): void => {
      releaseMarks()
      const state = search.state()
      const settled = state.query.trim() === serverQuery().trim()
      rows = dialogRows({ mode, query, hits: settled ? state.hits : [], loading: state.loading || !settled, recents: deps.recents.list(), curated: deps.curated ?? [], added: chart?.compare.list() ?? [], spreads })
      active = Math.min(active, rows.length - 1)
      const emptyStack = compare && query.trim() === ''
      const addedCount = emptyStack ? (chart?.compare.list().length ?? 0) : 0
      const children: (HTMLElement | null)[] = []
      rows.forEach((entry, i) => {
        if (emptyStack && i === 0 && addedCount > 0) children.push(h('div', { class: 'qc-dialog-heading', role: 'presentation' }, t('search.added')))
        if (emptyStack && i === addedCount && rows.length > addedCount) children.push(h('div', { class: 'qc-dialog-heading', role: 'presentation' }, t('search.recent')))
        const r = entry.row
        const label = rowLabels(r)
        const option = h('div', { class: 'qc-search-row', role: 'option', id: rowId(i), 'aria-selected': String(i === active), 'data-symbol-row': r.symbol, tabindex: '-1' })
        // The row's mark, through the host hook the legend uses, so a market wears one face across
        // the product. The list is rebuilt per render, so each mark is painted once into the row it
        // belongs to and released with it below.
        const mark = createSymbolBadge(label.ticker)
        mark.element.replaceChildren()
        const dropMark = deps.painters.symbol?.({ symbol: r.symbol, host: mark.element, size: ROW_MARK_SIZE })
        // A host mark OWNS the box: the package's disc and monogram stand down under it.
        if (typeof dropMark === 'function') {
          mark.element.dataset.qcHost = 'true'
          markDisposers.push(dropMark)
        } else mark.set(label.ticker)
        option.appendChild(mark.element)
        // The ticker over its description in compare, side by side in search: the compare row
        // stands taller and gives the mark a line of its own, where a search row is a list to
        // scan across.
        option.appendChild(h('span', { class: 'qc-search-text' }, marked(label.ticker), h('span', { class: 'qc-search-name' }, label.description)))
        if (compare && entry.added) {
          const mark = h('span', { class: 'qc-search-added', title: t('search.addedMark', { symbol: label.ticker }) })
          mark.appendChild(deps.icons.glyph(ICONS.check, { size: 18 }))
          option.appendChild(mark)
        } else {
          // The source cell: where this row's data comes from, over what kind of market it is.
          // In compare it steps aside under the pointer for the three placement verbs, because a
          // row a viewer is reaching for should offer what to DO rather than restate what it is.
          const source = h('span', { class: 'qc-search-source' })
          source.appendChild(h('span', { class: 'qc-search-source-text' }, label.source ? h('span', { class: 'qc-search-venue' }, label.source) : null, h('span', { class: 'qc-search-kind' }, r.type)))
          if (label.source) {
            // The source's mark: the venue's, or the provider's where the row names no venue,
            // through the host's hook. A host mark owns the box; without one the initial stands.
            const sourceMark = h('span', { class: 'qc-search-mark', 'aria-hidden': 'true' })
            const dropSource = r.exchange
              ? deps.painters.venue?.({ exchange: r.exchange, host: sourceMark, size: SOURCE_MARK_SIZE })
              : r.provider
                ? deps.painters.provider?.({ provider: r.provider, host: sourceMark, size: SOURCE_MARK_SIZE })
                : undefined
            if (typeof dropSource === 'function') {
              sourceMark.dataset.qcHost = 'true'
              markDisposers.push(dropSource)
            } else sourceMark.textContent = label.source.charAt(0).toUpperCase()
            source.appendChild(sourceMark)
          }
          option.appendChild(source)
          if (compare) {
            const actions = h('span', { class: 'qc-search-actions' })
            for (const p of PLACEMENTS) {
              actions.appendChild(
                button({
                  label: t(p.label),
                  text: t(p.label),
                  className: 'qc-search-place',
                  onClick: (e) => {
                    e.stopPropagation()
                    act(entry, p.placement)
                  },
                }),
              )
            }
            option.appendChild(actions)
          }
        }
        option.addEventListener('click', () => act(entry))
        children.push(option)
      })
      // Nothing added and nothing recent: the compare list has no rows to show and no query to
      // blame, so it invites the first comparison rather than reporting an absence in the status
      // line, where a viewer looking at an empty panel would never think to read.
      if (emptyStack && rows.length === 0) {
        const empty = h('div', { class: 'qc-search-empty' })
        empty.appendChild(deps.icons.glyph(COMPARE_EMPTY_MARK, { size: 121, height: 120 }))
        empty.appendChild(h('div', { class: 'qc-search-empty-note' }, t('search.compareEmpty')))
        children.push(empty)
      }
      replace(list, ...children)
      if (!emptyStack && settled && !state.loading && !state.failed && state.hasMore && rows.length > 0) {
        sentinel.hidden = false
        list.appendChild(sentinel)
        observer?.observe(sentinel)
      } else sentinel.hidden = true
      // "No matches" speaks about a SETTLED answer to a question. An empty compare list was never
      // a question, so the invitation above stands on its own rather than being called a failure.
      const answer: StatusKind = state.failed ? 'failed' : !emptyStack && rows.length === 0 && settled && !state.loading ? 'none' : 'rows'
      showStatus(answer)
      if (active >= 0) input.setAttribute('aria-activedescendant', rowId(active))
      else input.removeAttribute('aria-activedescendant')
    }
    // The status is rebuilt only when what it says changes, so a live region repainted on every
    // keystroke is not read aloud again for the same answer.
    let said: StatusKind = 'rows'
    const showStatus = (kind: StatusKind): void => {
      // A failure over rows still showing keeps the rows: the cache stood in for the feed.
      const listless = kind === 'none' || (kind === 'failed' && rows.length === 0)
      list.hidden = listless
      input.setAttribute('aria-expanded', String(!listless))
      if (kind === said) return
      said = kind
      if (kind === 'none') replace(status, emptyState(t('search.noMatches'), deps.icons))
      else if (kind === 'failed') replace(status, h('div', { class: 'qc-search-status-text' }, t('search.failed')))
      else replace(status)
    }
    const setActive = (i: number): void => {
      if (i === active) return
      if (active >= 0) list.querySelector(`#${rowId(active)}`)?.setAttribute('aria-selected', 'false')
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
        if (rows.length === 0) return
        if (search.state().hasMore && active >= rows.length - PREFETCH_MARGIN) search.loadMore()
        setActive(Math.min(active + 1, rows.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (rows.length === 0) return
        setActive(Math.max(active - 1, 0))
      } else if (e.key === 'Enter') {
        // Before an arrow has moved, Enter takes the top answer, as a search field does.
        const entry = rows[Math.max(active, 0)]
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
    // The strip's chips reflect the selection the strip opened on.
    setDisabled(clear, false)

  return {
    teardown() {
      scopeMarkDisposer?.()
      scopeMarkDisposer = null
      releaseMarks()
      search.dispose()
      observer?.disconnect()
    },
  }
}

export function openSearchDialog(deps: SearchDialogDeps): DialogHandle {
  const t = deps.i18n.t
  const mode = deps.request.mode
  const title = mode === 'compare' ? t('search.compareTitle') : mode === 'change-symbol' ? t('search.changeSymbolTitle') : t('search.title')
  let surface: SearchSurface | null = null
  const dialog = openDialog({
    host: deps.host,
    label: title,
    className: `qc-search-dialog qc-search-dialog--${mode}`,
    animated: true,
    // The compare family (compare, and a compare row's change-symbol) shares one role for a host
    // test to find; a symbol search, with or without a chart behind it, is the other.
    role: mode === 'compare' || mode === 'change-symbol' ? 'compare-dialog' : 'symbol-search',
    width: 840,
    onClose: () => {
      surface?.teardown()
      deps.onClose?.(dialog)
    },
    build(box, handle) {
      surface = buildSearchSurface(deps, box, { title, done: () => handle.close() })
    },
    initialFocus: (box) => box.querySelector<HTMLElement>('.qc-search-input'),
  })
  return dialog
}
