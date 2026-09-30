// @vitest-environment happy-dom
// The symbol search a page opens with no chart behind it: the same dialog, the same rows, the same
// keyboard, and a pick that goes back to whoever asked. It brings its own painted layer and takes
// it away again, so a page that opens it four times leaves nothing behind.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSymbolSearch, openSymbolSearch } from '../../src/ui/chrome/openSymbolSearch'
import { memoryRecents } from '../../src/search'
import type { ChartDatafeed, SymbolRow } from '../../src/datafeed'

const CATALOG: SymbolRow[] = [
  { symbol: 'ES', name: 'E-mini S&P 500', exchange: 'CME', type: 'future' },
  { symbol: 'NQ', name: 'E-mini Nasdaq', exchange: 'CME', type: 'future' },
  { symbol: 'BTCUSDC', name: 'Bitcoin', exchange: 'Hyperliquid', type: 'crypto' },
]

const datafeed: Pick<ChartDatafeed, 'search'> = {
  async search(query, options) {
    const needle = query.trim().toUpperCase()
    const hits = CATALOG.filter((row) => (!needle || row.symbol.includes(needle)) && (!options?.cls || row.type === options.cls))
    return { hits, hasMore: false }
  },
}

let cleanup: (() => void)[] = []
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  for (const fn of cleanup.splice(0)) fn()
  vi.useRealTimers()
  document.body.replaceChildren()
})

const settle = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(250)
}

const rows = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>('.qc-search-row'))
const dialog = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-role="symbol-search"]')

function open(extra: Partial<Parameters<typeof openSymbolSearch>[0]> = {}) {
  const picked: string[] = []
  const closed: true[] = []
  const handle = openSymbolSearch({
    datafeed,
    onPick: (symbol) => picked.push(symbol),
    onClose: () => closed.push(true),
    ...extra,
  })
  cleanup.push(() => handle.close())
  return { handle, picked, closed }
}

describe('the symbol search a page opens on its own', () => {
  it('lists the feed and hands the pick back, then takes its layer with it', async () => {
    const { picked, closed } = open({ query: 'ES' })
    await settle()
    expect(dialog()).not.toBeNull()
    expect(rows().length).toBeGreaterThan(0)
    rows()[0]!.click()
    expect(picked).toEqual(['ES'])
    expect(closed).toEqual([true])
    expect(document.querySelector('.qc-layer')).toBeNull()
  })

  it('opens holding the query it was given, selected so typing replaces it', async () => {
    open({ query: 'NQ' })
    await settle()
    const field = document.querySelector<HTMLInputElement>('.qc-search-input')!
    expect(field.value).toBe('NQ')
    expect(rows().some((row) => row.textContent?.includes('NQ'))).toBe(true)
  })

  it('paints its layer in the mode it is given', () => {
    open({ theme: { mode: 'light' } })
    const layer = document.querySelector<HTMLElement>('.qc-layer')!
    expect(layer.getAttribute('data-qc-theme')).toBe('light')
    expect(layer.style.getPropertyValue('--qc-chrome-surface')).not.toBe('')
  })

  it('reads right to left in a language that does', () => {
    open({ locale: 'ar' })
    expect(document.querySelector<HTMLElement>('.qc-layer')!.getAttribute('dir')).toBe('rtl')
  })

  it('remembers a pick in the recents the page keeps', async () => {
    const recents = memoryRecents()
    const { picked } = open({ recents, query: 'BTC' })
    await settle()
    rows()[0]!.click()
    expect(picked).toEqual(['BTCUSDC'])
    expect(recents.list().map((row) => row.symbol)).toEqual(['BTCUSDC'])
  })

  it('wears the host mark for a row source', async () => {
    const painted: string[] = []
    open({ query: 'ES', venueMark: ({ exchange, host }) => { painted.push(exchange); host.textContent = exchange.slice(0, 1) } })
    await settle()
    expect(painted).toContain('CME')
  })

  it('closes from the outside, and closing twice is safe', async () => {
    const { handle, closed } = open()
    await settle()
    handle.close()
    handle.close()
    expect(closed).toEqual([true])
    expect(document.querySelector('.qc-layer')).toBeNull()
  })

  it('mounts in the element the page names', async () => {
    const host = document.body.appendChild(document.createElement('section'))
    open({ container: host })
    await settle()
    expect(host.querySelector('.qc-layer')).not.toBeNull()
  })
})

describe('the same search in a box the page owns', () => {
  function mount(extra: Partial<Parameters<typeof mountSymbolSearch>[0]> = {}) {
    const container = document.body.appendChild(document.createElement('div'))
    const picked: string[] = []
    const closed: true[] = []
    const handle = mountSymbolSearch({
      container,
      datafeed,
      onPick: (symbol) => picked.push(symbol),
      onClose: () => closed.push(true),
      ...extra,
    })
    cleanup.push(() => handle.dispose())
    return { container, handle, picked, closed }
  }

  it('stands bare in the box: no scrim, no dialog, no title row', async () => {
    const { container } = mount()
    await settle()
    expect(container.querySelector('.qc-search-card')).not.toBeNull()
    expect(document.querySelector('.qc-dialog-scrim')).toBeNull()
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(container.querySelector('.qc-dialog-title')).toBeNull()
    expect(container.querySelector('.qc-search-input')).not.toBeNull()
  })

  it('lists the same markets as a table and hands the pick back', async () => {
    const { picked, closed } = mount({ query: 'NQ' })
    await settle()
    expect(document.querySelector('.qc-search-card')!.classList.contains('qc-search-table')).toBe(true)
    rows()[0]!.click()
    expect(picked).toEqual(['NQ'])
    expect(closed).toEqual([true])
  })

  it('goes when the page takes it down, and going twice is safe', async () => {
    const { container, handle } = mount()
    await settle()
    handle.dispose()
    handle.dispose()
    expect(container.querySelector('.qc-search-card')).toBeNull()
  })
})
