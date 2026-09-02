// The chart's compare dialog. Two modes: 'compare' (the legend's compare door, where rows add at
// any of the three placements, the ADDED section removes, and curated rows sit above search
// results) and 'change-symbol' (a compare row's title: one pick, returned to the caller). Same
// chrome discipline as the context menu and the legend: package-owned vanilla DOM, viewport-fixed,
// Escape and backdrop close, no framework, every visual from a `.qc-*` recipe. The search itself is
// the chart's search controller (search.ts): its debounce, cache and cancellation are the same ones
// every search surface gets.
//
// It mounts into the chart's own chrome subtree rather than the document body, because the package
// stylesheet is scoped to the chart root: a dialog parented anywhere else would resolve none of its
// own custom properties.
import type { ChartDatafeed, SymbolRow } from './datafeed'
import type { ChartI18n } from './i18n'
import type { CompareEntry, ComparePlacement, CompareSymbol } from './compare'
import { createSearchController, looksLikeSpread, SPREAD_OPERATORS, spreadExpression, type SpreadOperator } from './search'

export interface CompareDialogDeps {
  /** The chrome subtree the dialog mounts into. */
  container: HTMLElement
  strings: ChartI18n
  datafeed: ChartDatafeed
  mode: 'compare' | 'change-symbol'
  /** The curated quick-add rows (`compareSymbols`), rendered above results in compare mode. */
  curated?: readonly CompareSymbol[]
  /** The chart's current compares — the ADDED section, and the checkmark on curated rows. */
  added(): readonly CompareEntry[]
  onAdd?(symbol: string, placement: ComparePlacement): void
  onRemove?(symbol: string): void
  /** change-symbol mode's pick. */
  onPick?(symbol: string): void
  /** 'change-symbol': the current symbol, prefilled. */
  initialQuery?: string
  onClose?(): void
}

export interface CompareDialogHandle {
  close(): void
}

const PLACEMENTS: readonly { placement: ComparePlacement; key: 'search.samePercent' | 'search.newScale' | 'search.newPane' }[] = [
  { placement: 'same-percent', key: 'search.samePercent' },
  { placement: 'new-scale', key: 'search.newScale' },
  { placement: 'new-pane', key: 'search.newPane' },
]

/** The spread operators' glyphs, drawn on a 13 grid, by operator id.
 *  The operators themselves, their order and their names are the search module's. */
const OPERATOR_GLYPH: Readonly<Record<SpreadOperator['id'], string>> = {
  division:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 13 13" width="13" height="13"><path fill="none" stroke="currentColor" stroke-linecap="square" d="M2.5 6.5h9"></path><circle fill="currentColor" cx="7" cy="3" r="1"></circle><circle fill="currentColor" cx="7" cy="10" r="1"></circle></svg>',
  subtraction: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 13 13" width="13" height="13"><path fill="none" stroke="currentColor" stroke-linecap="square" d="M2.5 6.5h8"></path></svg>',
  addition: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 13 13" width="13" height="13"><path fill="none" stroke="currentColor" stroke-linecap="square" d="M2.5 6.5h8m-4-4v8"></path></svg>',
  multiplication: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 13 13" width="13" height="13"><path fill="none" stroke="currentColor" stroke-linecap="square" d="M3 10l7-7M3 3l7 7"></path></svg>',
  exponentiation: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 13 13" width="13" height="13"><path fill="none" stroke="currentColor" stroke-linecap="square" d="M3 7l3.5-3.5L10 7"></path></svg>',
  reciprocal:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 13 13" width="13" height="13"><g fill="none" fill-rule="evenodd" stroke="currentColor"><path stroke-linecap="square" stroke-linejoin="round" d="M3.5 10V2.5L1 5"></path><path stroke-linecap="square" d="M1.5 10.5h4"></path><path d="M8 12l3-11"></path></g></svg>',
}

/** The dialog's page: it lists a screen of rows and does not page. */
const DIALOG_PAGE = 20

/** Open the dialog over the widget. One instance per call; every close path (Esc, backdrop, a
 *  change-symbol pick) tears the DOM down and reports through `onClose`. */
export function openCompareDialog(deps: CompareDialogDeps): CompareDialogHandle {
  const { strings } = deps
  const t = strings.t

  const backdrop = document.createElement('div')
  backdrop.className = 'qc-scrim qc-dialog-backdrop'
  const box = document.createElement('div')
  box.className = 'qc-overlay qc-dialog'
  box.dataset.role = 'compare-dialog'
  backdrop.appendChild(box)

  const title = document.createElement('div')
  title.className = 'qc-title qc-dialog-title'
  title.textContent = deps.mode === 'compare' ? t('search.compareTitle') : t('search.changeSymbolTitle')
  box.appendChild(title)

  const inputRow = document.createElement('div')
  inputRow.className = 'qc-dialog-search'
  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'qc-dialog-input'
  input.placeholder = t('search.placeholder')
  input.value = deps.initialQuery ?? ''
  inputRow.appendChild(input)
  // The spread operators TYPE into the query; the feed parses and evaluates the expression, because
  // the whole expression is the instrument. Compare mode carries NO operator chrome: the buttons
  // belong to the search family, which here is change-symbol mode. An expression can still be typed
  // in either mode and still offers its row.
  for (const op of deps.mode === 'change-symbol' ? SPREAD_OPERATORS : []) {
    const b = document.createElement('button')
    b.type = 'button'
    b.title = t(op.label)
    b.setAttribute('aria-label', t(op.label))
    b.innerHTML = OPERATOR_GLYPH[op.id]
    b.className = 'qc-dialog-op'
    b.addEventListener('click', () => {
      input.value = op.prefix ? `${op.insert}${input.value}` : `${input.value}${op.insert}`
      input.focus()
      input.dispatchEvent(new Event('input'))
    })
    inputRow.appendChild(b)
  }
  box.appendChild(inputRow)

  const list = document.createElement('div')
  list.className = 'qc-dialog-list'
  box.appendChild(list)

  const search = createSearchController(deps.datafeed, { pageSize: DIALOG_PAGE })

  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    search.dispose()
    backdrop.remove()
    document.removeEventListener('keydown', onKey, true)
    deps.onClose?.()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      close()
    }
  }
  document.addEventListener('keydown', onKey, true)
  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) close()
  })
  // The dialog sits above the chart's gesture layers; keep its presses to itself.
  for (const type of ['pointerdown', 'pointerup', 'pointermove', 'wheel'] as const) {
    box.addEventListener(type, (e) => e.stopPropagation())
  }

  const heading = (text: string): HTMLElement => {
    const el = document.createElement('div')
    el.className = 'qc-dialog-heading'
    el.textContent = text
    return el
  }

  /** One result row: title + subtitle left; the right cell is the mode's verb — the three
   *  placement buttons (compare), a checkmark that removes (already added), or the row itself
   *  picking (change-symbol). */
  const rowEl = (row: { symbol: string; name?: string }, isAdded: boolean): HTMLElement => {
    const el = document.createElement('div')
    el.className = 'qc-dialog-row'
    el.dataset.symbolRow = row.symbol

    const text = document.createElement('div')
    text.className = 'qc-dialog-row-text'
    const sym = document.createElement('span')
    sym.textContent = row.symbol
    text.appendChild(sym)
    if (row.name) {
      const name = document.createElement('span')
      name.className = 'qc-dialog-row-name'
      name.textContent = row.name
      text.appendChild(name)
    }
    el.appendChild(text)

    if (deps.mode === 'change-symbol') {
      el.addEventListener('click', () => {
        deps.onPick?.(row.symbol)
        close()
      })
      return el
    }
    if (isAdded) {
      const mark = document.createElement('span')
      mark.className = 'qc-secondary'
      mark.textContent = '✓'
      mark.title = t('search.addedMark', { symbol: row.symbol })
      el.appendChild(mark)
      el.addEventListener('click', () => {
        deps.onRemove?.(row.symbol)
        render()
      })
      return el
    }
    const actions = document.createElement('span')
    actions.className = 'qc-dialog-row-actions'
    for (const p of PLACEMENTS) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'qc-button'
      b.textContent = t(p.key)
      b.addEventListener('click', (e) => {
        e.stopPropagation()
        deps.onAdd?.(row.symbol, p.placement)
        render()
      })
      actions.appendChild(b)
    }
    el.appendChild(actions)
    // Hover swaps in the three verbs. It is a stylesheet rule rather than two listeners, because a
    // hover state is a rule and not an event.
    // The row itself adds on the shared scale, which is the verb a plain click means.
    el.addEventListener('click', () => {
      deps.onAdd?.(row.symbol, 'same-percent')
      render()
    })
    return el
  }

  const render = () => {
    if (closed) return
    list.replaceChildren()
    const q = input.value.trim()
    const addedSet = new Set(deps.added().map((e) => e.symbol))
    if (deps.mode === 'compare' && q === '') {
      const added = deps.added()
      if (added.length > 0) {
        list.appendChild(heading(t('search.added')))
        for (const e of added) list.appendChild(rowEl({ symbol: e.symbol }, true))
      }
      for (const c of deps.curated ?? []) {
        if (!addedSet.has(c.symbol)) list.appendChild(rowEl({ symbol: c.symbol, name: c.title }, false))
      }
      return
    }
    const { hits, loading } = search.state()
    const shown: readonly SymbolRow[] = q === search.state().query.trim() ? hits : []
    for (const h of shown) list.appendChild(rowEl({ symbol: h.symbol, name: h.name }, addedSet.has(h.symbol)))
    // A query reading as an expression offers itself as a row — but ONLY when the search found NO
    // catalog hits. Catalog identity outranks arithmetic on the search surface exactly as it does
    // in the server's resolver ('ETH/USDC' names a listed market, so it lists the market), and an
    // expression row beside real hits would offer a spread the server refuses to evaluate.
    if (shown.length === 0 && !loading && looksLikeSpread(q)) {
      const expr = spreadExpression(q)
      list.appendChild(rowEl({ symbol: expr }, addedSet.has(expr)))
    }
  }

  search.subscribe(render)
  input.addEventListener('input', () => {
    const q = input.value.trim()
    if (deps.mode === 'compare' && q === '') {
      render()
      return
    }
    search.search(q)
  })

  deps.container.appendChild(backdrop)
  input.focus()
  if (deps.initialQuery) input.select()
  render()
  if (deps.mode !== 'compare' || input.value.trim() !== '') search.search(input.value.trim())

  return { close }
}
