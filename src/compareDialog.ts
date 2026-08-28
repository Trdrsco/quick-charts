// The widget's compare dialog — the framework-free twin of the app's dialog family (corpus:
// docs/corpus/chart-compare/): the same MODEL, this package's painter. Two modes: 'compare' (the
// legend's compare door — rows add at any of the three placements, the ADDED section removes,
// curated `compareSymbols` rows sit above search results) and 'change-symbol' (a compare chip's
// title — one pick, returned to the caller). Same chrome discipline as the context menu and the
// legend: theme-tinted vanilla DOM, viewport-fixed, Esc/backdrop close, no framework.
import type { ChartDatafeed, SymbolRow } from './datafeed'
import type { ResolvedTheme } from './host'
import type { ChartI18n } from './i18n'
import type { CompareEntry, ComparePlacement, CompareSymbol } from './compare'

export interface CompareDialogDeps {
  theme: ResolvedTheme
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

const PLACEMENTS: readonly { placement: ComparePlacement; key: 'legend.samePercent' | 'legend.newScale' | 'legend.newPane' }[] = [
  { placement: 'same-percent', key: 'legend.samePercent' },
  { placement: 'new-scale', key: 'legend.newScale' },
  { placement: 'new-pane', key: 'legend.newPane' },
]

/** Open the dialog over the widget. One instance per call; every close path (Esc, backdrop, a
 *  change-symbol pick) tears the DOM down and reports through `onClose`. */
export function openCompareDialog(deps: CompareDialogDeps): CompareDialogHandle {
  const { theme, strings } = deps
  const t = strings.t

  const backdrop = document.createElement('div')
  backdrop.style.cssText = 'position:fixed;inset:0;z-index:2147483002;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;'
  const box = document.createElement('div')
  box.dataset.role = 'compare-dialog'
  box.style.cssText =
    `width:min(480px,calc(100vw - 32px));max-height:min(420px,calc(100vh - 32px));display:flex;flex-direction:column;overflow:hidden;` +
    `background:${theme.background};border:1px solid ${theme.gridColor};border-radius:6px;color:${theme.textColor};` +
    'font-family:inherit;font-size:12px;box-shadow:0 12px 32px rgba(0,0,0,0.5);'
  backdrop.appendChild(box)

  const title = document.createElement('div')
  title.textContent = deps.mode === 'compare' ? t('legend.compareTitle') : t('legend.changeSymbol')
  title.style.cssText = 'padding:12px 14px;font-size:14px;font-weight:600;'
  box.appendChild(title)

  const inputRow = document.createElement('div')
  inputRow.style.cssText =
    `margin:0 14px 8px;display:flex;align-items:center;gap:2px;padding:0 6px 0 0;border:1px solid ${theme.gridColor};border-radius:6px;`
  const input = document.createElement('input')
  input.type = 'text'
  input.placeholder = t('legend.searchPlaceholder')
  input.value = deps.initialQuery ?? ''
  input.style.cssText = `flex:1;min-width:0;padding:6px 10px;background:none;border:none;color:${theme.textColor};font-size:12px;outline:none;text-transform:uppercase;`
  inputRow.appendChild(input)
  // The spread operators — the reference's own 13-grid glyphs (verbatim) on 24×24 buttons. They
  // TYPE into the query; the server parses and evaluates the expression (the whole expression is
  // the instrument).
  const OPS: readonly { svg: string; key: 'legend.opDivision' | 'legend.opSubtraction' | 'legend.opAddition' | 'legend.opMultiplication' | 'legend.opExponentiation' | 'legend.opReciprocal'; insert: string; prefix?: boolean }[] = [
    { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 13 13" width="13" height="13"><path fill="none" stroke="currentColor" stroke-linecap="square" d="M2.5 6.5h9"></path><circle fill="currentColor" cx="7" cy="3" r="1"></circle><circle fill="currentColor" cx="7" cy="10" r="1"></circle></svg>', key: 'legend.opDivision', insert: '/' },
    { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 13 13" width="13" height="13"><path fill="none" stroke="currentColor" stroke-linecap="square" d="M2.5 6.5h8"></path></svg>', key: 'legend.opSubtraction', insert: '-' },
    { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 13 13" width="13" height="13"><path fill="none" stroke="currentColor" stroke-linecap="square" d="M2.5 6.5h8m-4-4v8"></path></svg>', key: 'legend.opAddition', insert: '+' },
    { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 13 13" width="13" height="13"><path fill="none" stroke="currentColor" stroke-linecap="square" d="M3 10l7-7M3 3l7 7"></path></svg>', key: 'legend.opMultiplication', insert: '*' },
    { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 13 13" width="13" height="13"><path fill="none" stroke="currentColor" stroke-linecap="square" d="M3 7l3.5-3.5L10 7"></path></svg>', key: 'legend.opExponentiation', insert: '^' },
    { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 13 13" width="13" height="13"><g fill="none" fill-rule="evenodd" stroke="currentColor"><path stroke-linecap="square" stroke-linejoin="round" d="M3.5 10V2.5L1 5"></path><path stroke-linecap="square" d="M1.5 10.5h4"></path><path d="M8 12l3-11"></path></g></svg>', key: 'legend.opReciprocal', insert: '1/', prefix: true },
  ]
  // Compare mode carries NO operator chrome — the reference's compare dialog ships
  // `showSpreadActions: false` (captured); the buttons belong to the search family, which in the
  // widget is change-symbol mode. Expressions still type and still offer their row either way.
  for (const op of deps.mode === 'change-symbol' ? OPS : []) {
    const b = document.createElement('button')
    b.type = 'button'
    b.title = t(op.key)
    b.setAttribute('aria-label', t(op.key))
    b.innerHTML = op.svg
    b.style.cssText = `display:flex;align-items:center;justify-content:center;width:24px;height:24px;background:none;border:none;border-radius:4px;color:${theme.textColor};opacity:0.55;cursor:pointer;padding:0;`
    b.addEventListener('click', () => {
      input.value = op.prefix ? `${op.insert}${input.value}` : `${input.value}${op.insert}`
      input.focus()
      input.dispatchEvent(new Event('input'))
    })
    inputRow.appendChild(b)
  }
  box.appendChild(inputRow)

  const list = document.createElement('div')
  list.style.cssText = 'min-height:0;flex:1;overflow-y:auto;padding-bottom:6px;'
  box.appendChild(list)

  let closed = false
  const close = () => {
    if (closed) return
    closed = true
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
    el.textContent = text
    el.style.cssText = 'padding:8px 14px 4px;font-size:10px;text-transform:uppercase;letter-spacing:0.4px;opacity:0.6;'
    return el
  }

  /** One result row: title + subtitle left; the right cell is the mode's verb — the three
   *  placement buttons (compare), a checkmark that removes (already added), or the row itself
   *  picking (change-symbol). */
  const rowEl = (row: { symbol: string; name?: string }, isAdded: boolean): HTMLElement => {
    const el = document.createElement('div')
    el.dataset.symbolRow = row.symbol
    el.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 14px;cursor:pointer;'
    el.addEventListener('mouseenter', () => (el.style.background = 'rgba(128,128,128,0.15)'))
    el.addEventListener('mouseleave', () => (el.style.background = 'none'))

    const text = document.createElement('div')
    text.style.cssText = 'min-width:0;flex:1;display:flex;flex-direction:column;'
    const sym = document.createElement('span')
    sym.textContent = row.symbol
    sym.style.cssText = 'font-size:12px;'
    text.appendChild(sym)
    if (row.name) {
      const name = document.createElement('span')
      name.textContent = row.name
      name.style.cssText = 'font-size:10px;opacity:0.65;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
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
      mark.textContent = '✓'
      mark.title = t('legend.removeCompare')
      mark.style.cssText = 'opacity:0.8;'
      el.appendChild(mark)
      el.addEventListener('click', () => {
        deps.onRemove?.(row.symbol)
        render()
      })
      return el
    }
    const actions = document.createElement('span')
    actions.style.cssText = 'display:none;gap:4px;'
    for (const p of PLACEMENTS) {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = t(p.key)
      b.style.cssText = `background:none;border:1px solid ${theme.gridColor};border-radius:4px;color:${theme.textColor};cursor:pointer;padding:2px 6px;font-size:10px;white-space:nowrap;`
      b.addEventListener('click', (e) => {
        e.stopPropagation()
        deps.onAdd?.(row.symbol, p.placement)
        render()
      })
      actions.appendChild(b)
    }
    el.appendChild(actions)
    // Hover swaps in the three verbs, the reference's own row behaviour (JS, because the chrome
    // ships no stylesheet for :hover to live in).
    el.addEventListener('mouseenter', () => (actions.style.display = 'inline-flex'))
    el.addEventListener('mouseleave', () => (actions.style.display = 'none'))
    // The row itself adds on the shared scale — the reference's first verb.
    el.addEventListener('click', () => {
      deps.onAdd?.(row.symbol, 'same-percent')
      render()
    })
    return el
  }

  let searchSeq = 0
  let hits: SymbolRow[] = []
  const render = () => {
    if (closed) return
    list.replaceChildren()
    const q = input.value.trim()
    const addedSet = new Set(deps.added().map((e) => e.symbol))
    if (deps.mode === 'compare' && q === '') {
      const added = deps.added()
      if (added.length > 0) {
        list.appendChild(heading(t('legend.added')))
        for (const e of added) list.appendChild(rowEl({ symbol: e.symbol }, true))
      }
      for (const c of deps.curated ?? []) {
        if (!addedSet.has(c.symbol)) list.appendChild(rowEl({ symbol: c.symbol, name: c.title }, false))
      }
      return
    }
    for (const h of hits) list.appendChild(rowEl({ symbol: h.symbol, name: h.name }, addedSet.has(h.symbol)))
    // A query reading as an expression offers itself as a row — but ONLY when the search found NO
    // catalog hits. Catalog identity outranks arithmetic on the search surface exactly as it does
    // in the server's resolver ('ETH/USDC' names a listed market, so it lists the market — the
    // reference's measured behaviour), and an expression row beside real hits would offer a spread
    // the server deliberately refuses to evaluate.
    const expr = q.toUpperCase().replace(/\s+/g, '')
    if (hits.length === 0 && /[+\-*/^]/.test(expr) && /[A-Za-z]/.test(q) && /^[A-Za-z0-9:._+\-*/^()]+$/.test(expr)) {
      list.appendChild(rowEl({ symbol: expr }, addedSet.has(expr)))
    }
  }

  const search = () => {
    const seq = ++searchSeq
    const q = input.value.trim()
    if (deps.mode === 'compare' && q === '') {
      hits = []
      render()
      return
    }
    void deps.datafeed
      .search(q, { limit: 20 })
      .then((page) => {
        if (closed || seq !== searchSeq) return
        hits = [...page.hits]
        render()
      })
      .catch(() => {
        /* a failed search leaves the list as it was; the next keystroke retries */
      })
  }

  let debounce: ReturnType<typeof setTimeout> | undefined
  input.addEventListener('input', () => {
    clearTimeout(debounce)
    debounce = setTimeout(search, 200)
  })

  document.body.appendChild(backdrop)
  input.focus()
  if (deps.initialQuery) input.select()
  render()
  search()

  return { close }
}
