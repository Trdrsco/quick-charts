// The account panel — the widget's positions/orders manager, fed by the SAME AccountSnapshot the
// trade lines consume (one data plane, two views) and acting through the SAME ChartBroker seam
// (one write path, still). Vanilla DOM by the measured chrome policy, quiet by the product's
// taste. Presence-driven throughout: the Reverse control renders only when the broker implements
// reversePosition; a mutation-only integration still closes and cancels. Numbers are the venue's
// own or '—' — the panel computes no money figure of its own.
import type { ChartBroker } from './broker'
import type { AccountSnapshot } from './tradingAdapter'
import type { ResolvedTheme } from './host'

const PAGES = ['Positions', 'Orders'] as const
type PanelPage = (typeof PAGES)[number]

export interface AccountPanelHandle {
  /** Feed the latest full snapshot (the panel re-renders its active page from it). */
  update(snapshot: AccountSnapshot): void
  destroy(): void
}

export function mountAccountPanel(
  host: HTMLElement,
  broker: ChartBroker,
  theme: ResolvedTheme,
  events: { onAction?: (text: string) => void; onError?: (msg: string) => void },
): AccountPanelHandle {
  let snapshot: AccountSnapshot = { scope: null, positions: [], orders: [] }
  let page: PanelPage = 'Positions'

  const root = document.createElement('div')
  root.style.cssText =
    `display:flex;flex-direction:column;overflow:hidden;height:100%;` +
    `background:${theme.background};border-top:1px solid ${theme.gridColor};color:${theme.textColor};font-size:11px;line-height:16px;`
  for (const type of ['pointerdown', 'pointerup', 'pointermove'] as const) root.addEventListener(type, (e) => e.stopPropagation())

  const tabs = document.createElement('div')
  tabs.style.cssText = 'display:flex;gap:4px;padding:6px 8px;flex-shrink:0;'
  const body = document.createElement('div')
  body.style.cssText = 'flex:1 1 auto;min-height:0;overflow-y:auto;padding:0 8px 6px;'
  root.append(tabs, body)
  host.appendChild(root)

  const armed = () => snapshot.scope !== null && snapshot.locked !== true

  /** One money action: disabled unless armed; failures speak the broker's words. */
  const actionButton = (label: string, title: string, run: () => Promise<void>): HTMLButtonElement => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = label
    b.title = title
    b.disabled = !armed()
    b.style.cssText =
      `background:none;border:1px solid ${theme.gridColor};border-radius:4px;color:${theme.textColor};` +
      `cursor:${armed() ? 'pointer' : 'default'};opacity:${armed() ? 1 : 0.45};padding:1px 6px;font-size:10px;`
    b.addEventListener('click', () => {
      if (!armed()) return
      run().catch((e: unknown) => events.onError?.(e instanceof Error ? e.message : String(e)))
    })
    return b
  }

  const row = (cells: (string | HTMLElement)[], tone?: 'profit' | 'loss' | null): HTMLDivElement => {
    const r = document.createElement('div')
    r.style.cssText = `display:flex;align-items:center;gap:10px;padding:3px 0;border-bottom:1px solid ${theme.gridColor};`
    for (const cell of cells) {
      if (typeof cell === 'string') {
        const s = document.createElement('span')
        s.textContent = cell
        r.appendChild(s)
      } else r.appendChild(cell)
    }
    if (tone) {
      const last = r.querySelector('span:nth-child(4)') as HTMLSpanElement | null
      if (last) last.style.color = tone === 'loss' ? theme.downColor : theme.upColor
    }
    return r
  }

  const empty = (text: string): HTMLDivElement => {
    const d = document.createElement('div')
    d.textContent = text
    d.style.cssText = 'padding:8px 0;opacity:0.6;'
    return d
  }

  const render = () => {
    tabs.replaceChildren()
    for (const p of PAGES) {
      const count = p === 'Positions' ? snapshot.positions.length : snapshot.orders.length
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = count > 0 ? `${p} (${count})` : p
      const active = p === page
      b.style.cssText =
        `background:none;border:1px solid ${active ? theme.upColor : theme.gridColor};border-radius:5px;` +
        `color:${active ? theme.upColor : theme.textColor};cursor:pointer;padding:2px 8px;font-size:11px;`
      b.addEventListener('click', () => {
        page = p
        render()
      })
      tabs.appendChild(b)
    }

    body.replaceChildren()
    if (page === 'Positions') {
      if (snapshot.positions.length === 0) {
        body.appendChild(empty('No open positions'))
        return
      }
      for (const p of snapshot.positions) {
        const pnl = p.unrealizedPnl
        const pnlText = pnl == null ? '—' : `${pnl < 0 ? '−' : ''}${Math.abs(pnl).toFixed(2)}${snapshot.currency ? ` ${snapshot.currency}` : ''}`
        const cells: (string | HTMLElement)[] = [
          p.instrument,
          `${p.qty > 0 ? 'Long' : 'Short'} ${Math.abs(p.qty)}`,
          p.avgPrice == null ? '—' : `@ ${p.avgPrice}`,
          pnlText,
        ]
        const close = actionButton('Close', `Close ${p.instrument} at market`, () => broker.flatten(p.instrument))
        cells.push(close)
        if (broker.reversePosition) {
          cells.push(
            actionButton('Reverse', `Reverse ${p.instrument}`, async () => {
              const r = await broker.reversePosition!({ instrument: p.instrument, intentKey: `panel|reverse|${snapshot.scope}|${p.instrument}|${Date.now()}` })
              events.onAction?.(`Reversed ${p.instrument} (${r.cancelledOrders} orders cancelled)`)
            }),
          )
        }
        body.appendChild(row(cells, pnl == null ? null : pnl < 0 ? 'loss' : 'profit'))
      }
      return
    }
    if (snapshot.orders.length === 0) {
      body.appendChild(empty('No working orders'))
      return
    }
    for (const o of snapshot.orders) {
      const price = o.limitPrice ?? o.triggerPrice
      const cells: (string | HTMLElement)[] = [
        o.instrument,
        `${o.side === 'buy' ? 'Buy' : 'Sell'} ${o.qty} ${o.orderType.replace(/_/g, ' ')}`,
        price == null ? '—' : `@ ${price}`,
        o.status,
      ]
      cells.push(actionButton('Cancel', `Cancel ${o.brokerOrderId}`, () => broker.cancelOrder(o.brokerOrderId)))
      body.appendChild(row(cells))
    }
  }

  render()
  return {
    update(next) {
      snapshot = next
      render()
    },
    destroy() {
      root.remove()
    },
  }
}
