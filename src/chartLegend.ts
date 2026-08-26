// The widget's legend: a quiet framework-free strip over the chart — the symbol/timeframe header
// with a market-status dot and the price-scale mode chips, then one chip per indicator instance
// (title, latest value, per-chip controls: settings gear, pane collapse/maximize for pane-placed
// instances, the eye). Same chrome discipline as the drawings rail: theme-tinted DOM the package
// owns end to end, no framework. Every control reports INTENT to the host (the widget owns state
// and re-renders); the legend never mutates chart state itself.
import type { ResolvedTheme } from './host'
import type { ChartI18n } from './i18n'
import { SCALE_MODE_OPTIONS, type ScaleMode } from './scaleMode'

/** One legend row. `value` arrives pre-formatted (the host owns precision); `note` is the
 *  instance's unavailable message ("No volume from this feed"), rendered instead of a value. */
export interface LegendChip {
  id: string
  title: string
  value: string | null
  note?: string
  hidden: boolean
  /** The instance declares inputs — the settings gear renders. */
  hasInputs?: boolean
  /** Pane-placed instance: the chip carries the pane controls. */
  pane?: boolean
  /** The instance's pane currently reads as collapsed (drives which control shows). */
  collapsed?: boolean
}

export interface LegendControls {
  onToggleEye(id: string): void
  /** The chip's settings gear was tapped — open the host's inputs editor at this viewport rect. */
  onSettings?(id: string, rect: { x: number; y: number; w: number; h: number }): void
  /** A pane chip's collapse/maximize/restore control. */
  onPaneOp?(id: string, op: 'collapse' | 'maximize' | 'restore'): void
  /** A scale-mode chip on the header. */
  onScaleMode?(mode: ScaleMode): void
}

export interface ChartLegend {
  setHeader(symbol: string, tf: string): void
  /** The market-status dot color (SESSION_DOT[...]), or null to hide the dot. */
  setDot(color: string | null): void
  /** Highlight the active scale-mode chip. */
  syncScale(mode: ScaleMode): void
  setChips(chips: readonly LegendChip[]): void
  destroy(): void
}

const EYE = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/></svg>'
const EYE_OFF = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 12s3.5-6 10-6c1.8 0 3.4.5 4.8 1.2M22 12s-3.5 6-10 6c-1.8 0-3.4-.5-4.8-1.2"/><path d="M4 20 20 4"/></svg>'
/** The chips' own words, by scale mode — SCALE_MODE_OPTIONS carries the English of each as its
 *  `label`, which is what a host rendering its own settings control shows. */
const SCALE_MODE_KEY: Record<ScaleMode, 'legend.scaleNormal' | 'legend.scaleLog' | 'legend.scalePercent' | 'legend.scaleIndexed'> = {
  normal: 'legend.scaleNormal',
  log: 'legend.scaleLog',
  percent: 'legend.scalePercent',
  indexed: 'legend.scaleIndexed',
}

const GEAR = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/></svg>'

/** `strings` is the widget's language: every visible label reads through `strings.t` at render time,
 *  and the legend re-renders itself when the language changes, so a switch never leaves a stale
 *  title on a button that was drawn before it. */
export function mountChartLegend(container: HTMLElement, theme: ResolvedTheme, strings: ChartI18n, controls: LegendControls): ChartLegend {
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

  // The scale-mode chips ride the header (present only when the host handles them).
  const scaleButtons = new Map<ScaleMode, HTMLButtonElement>()
  const titleScaleButtons = () => {
    for (const [id, b] of scaleButtons) {
      b.title = strings.t('legend.priceScale', { mode: id })
      b.textContent = strings.t(SCALE_MODE_KEY[id])
    }
  }
  if (controls.onScaleMode) {
    const row = document.createElement('span')
    row.style.cssText = 'display:inline-flex;gap:2px;margin-left:4px;pointer-events:auto;'
    for (const opt of SCALE_MODE_OPTIONS) {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = strings.t(SCALE_MODE_KEY[opt.id])
      b.style.cssText = `background:none;border:1px solid ${theme.gridColor};border-radius:4px;color:${theme.textColor};cursor:pointer;padding:0 5px;font-size:10px;line-height:14px;`
      b.addEventListener('click', () => controls.onScaleMode?.(opt.id))
      scaleButtons.set(opt.id, b)
      row.appendChild(b)
    }
    titleScaleButtons()
    header.appendChild(row)
  }

  const chipRows = document.createElement('div')
  chipRows.style.cssText = 'display:flex;flex-direction:column;gap:1px;'
  root.append(header, chipRows)
  container.appendChild(root)

  const chipButton = (glyphOrText: string, titleText: string, onClick: () => void, isHtml = false): HTMLButtonElement => {
    const b = document.createElement('button')
    b.type = 'button'
    b.title = titleText
    if (isHtml) b.innerHTML = glyphOrText
    else b.textContent = glyphOrText
    b.style.cssText = `display:flex;align-items:center;background:none;border:none;color:${theme.textColor};cursor:pointer;padding:0;font-size:10px;`
    b.addEventListener('click', onClick)
    return b
  }

  let lastChips: readonly LegendChip[] = []
  const render = (chips: readonly LegendChip[]) => {
    chipRows.replaceChildren()
    for (const chip of chips) {
      const row = document.createElement('div')
      row.style.cssText = `display:flex;align-items:center;gap:6px;pointer-events:auto;opacity:${chip.hidden ? 0.5 : 1};`
      const label = document.createElement('span')
      label.textContent = chip.note ? `${chip.title} — ${chip.note}` : chip.hidden || chip.value == null ? chip.title : `${chip.title}  ${chip.value}`
      row.appendChild(label)
      if (chip.hasInputs && controls.onSettings) {
        const gear = chipButton(GEAR, strings.t('legend.indicatorSettings'), () => {
          const r = gear.getBoundingClientRect()
          controls.onSettings!(chip.id, { x: r.x, y: r.y, w: r.width, h: r.height })
        }, true)
        row.appendChild(gear)
      }
      if (chip.pane && controls.onPaneOp && !chip.hidden) {
        row.appendChild(
          chip.collapsed
            ? chipButton('▴', strings.t('legend.restorePane'), () => controls.onPaneOp!(chip.id, 'restore'))
            : chipButton('▾', strings.t('legend.collapsePane'), () => controls.onPaneOp!(chip.id, 'collapse')),
        )
        if (!chip.collapsed) row.appendChild(chipButton('⤢', strings.t('legend.maximizePane'), () => controls.onPaneOp!(chip.id, 'maximize')))
      }
      const eye = chipButton(
        chip.hidden ? EYE_OFF : EYE,
        chip.hidden ? strings.t('legend.showIndicator') : strings.t('legend.hideIndicator'),
        () => controls.onToggleEye(chip.id),
        true,
      )
      row.appendChild(eye)
      chipRows.appendChild(row)
    }
  }

  const unsubscribe = strings.onChange(() => {
    titleScaleButtons()
    render(lastChips)
  })

  return {
    setHeader(symbol, tf) {
      title.textContent = symbol ? `${symbol} · ${tf}` : ''
    },
    setDot(color) {
      dot.style.display = color ? 'inline-block' : 'none'
      if (color) dot.style.background = color
    },
    syncScale(mode) {
      for (const [id, b] of scaleButtons) {
        const active = id === mode
        b.style.color = active ? theme.upColor : theme.textColor
        b.style.borderColor = active ? theme.upColor : theme.gridColor
      }
    },
    setChips(chips) {
      lastChips = chips
      render(chips)
    },
    destroy() {
      unsubscribe()
      root.remove()
    },
  }
}
