// The widget's legend: a quiet framework-free strip over the chart — the symbol/timeframe header
// with a market-status dot, then one chip per indicator instance (title, latest value, per-chip
// eye). Same chrome discipline as the drawings rail: theme-tinted DOM the package owns end to
// end, no framework. The eye reports intent to the HOST (the widget owns the hidden state and the
// re-render); the legend never mutates chart state itself.
import type { ResolvedTheme } from './host'

/** One legend row. `value` arrives pre-formatted (the host owns precision); `note` is the
 *  instance's unavailable message ("No volume from this feed"), rendered instead of a value. */
export interface LegendChip {
  id: string
  title: string
  value: string | null
  note?: string
  hidden: boolean
}

export interface ChartLegend {
  setHeader(symbol: string, tf: string): void
  /** The market-status dot color (SESSION_DOT[...]), or null to hide the dot. */
  setDot(color: string | null): void
  setChips(chips: readonly LegendChip[]): void
  destroy(): void
}

const EYE = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/></svg>'
const EYE_OFF = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 12s3.5-6 10-6c1.8 0 3.4.5 4.8 1.2M22 12s-3.5 6-10 6c-1.8 0-3.4-.5-4.8-1.2"/><path d="M4 20 20 4"/></svg>'

export function mountChartLegend(container: HTMLElement, theme: ResolvedTheme, onToggleEye: (id: string) => void): ChartLegend {
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative'

  const root = document.createElement('div')
  // Offset right of the drawings rail's column; pointer events pass through except on the chips
  // themselves, so the legend never blocks chart gestures under it.
  root.style.cssText =
    'position:absolute;left:44px;top:8px;z-index:3;display:flex;flex-direction:column;gap:2px;' +
    `pointer-events:none;font-size:11px;line-height:16px;color:${theme.textColor};font-family:inherit;`
  for (const type of ['pointerdown', 'pointerup', 'pointermove'] as const) {
    root.addEventListener(type, (e) => e.stopPropagation())
  }

  const header = document.createElement('div')
  header.style.cssText = 'display:flex;align-items:center;gap:6px;pointer-events:none;'
  const title = document.createElement('span')
  const dot = document.createElement('span')
  dot.style.cssText = 'width:7px;height:7px;border-radius:50%;display:none;'
  header.append(title, dot)

  const chipRows = document.createElement('div')
  chipRows.style.cssText = 'display:flex;flex-direction:column;gap:1px;'
  root.append(header, chipRows)
  container.appendChild(root)

  return {
    setHeader(symbol, tf) {
      title.textContent = symbol ? `${symbol} · ${tf}` : ''
    },
    setDot(color) {
      dot.style.display = color ? 'inline-block' : 'none'
      if (color) dot.style.background = color
    },
    setChips(chips) {
      chipRows.replaceChildren()
      for (const chip of chips) {
        const row = document.createElement('div')
        row.style.cssText = `display:flex;align-items:center;gap:6px;pointer-events:auto;opacity:${chip.hidden ? 0.5 : 1};`
        const label = document.createElement('span')
        label.textContent = chip.note ? `${chip.title} — ${chip.note}` : chip.hidden || chip.value == null ? chip.title : `${chip.title}  ${chip.value}`
        const eye = document.createElement('button')
        eye.type = 'button'
        eye.title = chip.hidden ? 'Show indicator' : 'Hide indicator'
        eye.innerHTML = chip.hidden ? EYE_OFF : EYE
        eye.style.cssText = `display:flex;align-items:center;background:none;border:none;color:${theme.textColor};cursor:pointer;padding:0;`
        eye.addEventListener('click', () => onToggleEye(chip.id))
        row.append(label, eye)
        chipRows.appendChild(row)
      }
    },
    destroy() {
      root.remove()
    },
  }
}
