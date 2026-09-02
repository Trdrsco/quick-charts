// The chart's legend: a quiet framework-free strip over the plot area — the symbol/timeframe header
// with a market-status dot and the price-scale mode chips, then one row per indicator instance
// (title, latest value, per-row controls: settings gear, pane collapse/maximize for pane-placed
// instances, the eye). Same chrome discipline as the drawing rail: package-owned DOM, no framework,
// and every visual comes from a `.qc-*` recipe in the package stylesheet rather than a style
// string. Only the left inset is written inline, because only it is calculated at runtime.
//
// Every control reports INTENT to the chart, which owns the state and re-renders; the legend never
// mutates chart state itself.
import type { ChartI18n } from './i18n'
import type { MarketSession } from './sessions'
import { SCALE_MODE_OPTIONS, type ScaleMode } from './scaleMode'

/** One legend row. `value` arrives pre-formatted (the chart owns precision); `note` is the
 *  instance's unavailable message, rendered instead of a value. */
export interface LegendChip {
  id: string
  title: string
  value: string | null
  note?: string
  hidden: boolean
  /** The instance declares inputs, so the settings gear renders. */
  hasInputs?: boolean
  /** Pane-placed instance: the row carries the pane controls. */
  pane?: boolean
  /** The instance's pane currently reads as collapsed (drives which control shows). */
  collapsed?: boolean
  /** The TITLE is a button (a compare row's change-symbol door) — needs `onTitle`. */
  titleButton?: boolean
  /** The row carries a remove control (compares are legend-removable). */
  removable?: boolean
}

export interface LegendControls {
  onToggleEye(id: string): void
  /** The row's settings gear was tapped — open the inputs editor at this viewport rect. */
  onSettings?(id: string, rect: { x: number; y: number; w: number; h: number }): void
  /** A pane row's collapse/maximize/restore control. */
  onPaneOp?(id: string, op: 'collapse' | 'maximize' | 'restore'): void
  /** A scale-mode chip on the header. */
  onScaleMode?(mode: ScaleMode): void
  /** A `titleButton` row's title was tapped (a compare's change-symbol). */
  onTitle?(id: string): void
  /** A `removable` row's remove control was tapped. */
  onRemove?(id: string): void
  /** The header's compare door was tapped — present only when the chart serves the dialog. */
  onCompare?(): void
}

export interface ChartLegend {
  setHeader(symbol: string, tf: string): void
  /** Extra left offset (px) past the strip's rail column — the LEFT price scale's width while a
   *  new-scale compare holds it up, so the strip never overlays the axis numbers. */
  setLeftInset(px: number): void
  /** The market session the dot shows, or null to hide it. The dot's color is the session's own
   *  theme role, resolved by the stylesheet from the attribute written here. */
  setDot(session: MarketSession | null): void
  /** Highlight the active scale-mode chip. */
  syncScale(mode: ScaleMode): void
  setChips(chips: readonly LegendChip[]): void
  destroy(): void
}

const EYE = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/></svg>'
const EYE_OFF = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 12s3.5-6 10-6c1.8 0 3.4.5 4.8 1.2M22 12s-3.5 6-10 6c-1.8 0-3.4-.5-4.8-1.2"/><path d="M4 20 20 4"/></svg>'
const GEAR = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/></svg>'

/** The strip's own left column, past the drawing rail. */
const RAIL_COLUMN_PX = 44

/** `strings` is the chart's language: every visible label reads through `strings.t` at render time,
 *  and the legend re-renders itself when the language changes, so a switch never leaves a stale
 *  title on a button that was drawn before it. */
export function mountChartLegend(container: HTMLElement, strings: ChartI18n, controls: LegendControls): ChartLegend {
  const root = document.createElement('div')
  root.className = 'qc-legend'
  root.style.left = `${RAIL_COLUMN_PX}px`
  for (const type of ['pointerdown', 'pointerup', 'pointermove'] as const) {
    root.addEventListener(type, (e) => e.stopPropagation())
  }

  const header = document.createElement('div')
  header.className = 'qc-legend-header'
  const title = document.createElement('span')
  const dot = document.createElement('span')
  dot.className = 'qc-session-dot qc-legend-dot'
  dot.hidden = true
  header.append(title, dot)

  // The scale-mode chips ride the header (present only when the chart handles them).
  const scaleButtons = new Map<ScaleMode, HTMLButtonElement>()
  const titleScaleButtons = (): void => {
    for (const opt of SCALE_MODE_OPTIONS) {
      const b = scaleButtons.get(opt.id)
      if (!b) continue
      b.title = strings.t('legend.priceScale', { mode: opt.id })
      b.textContent = strings.t(opt.label)
    }
  }
  if (controls.onScaleMode) {
    const row = document.createElement('span')
    row.className = 'qc-legend-scales'
    for (const opt of SCALE_MODE_OPTIONS) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'qc-button qc-chip'
      b.textContent = strings.t(opt.label)
      b.addEventListener('click', () => controls.onScaleMode?.(opt.id))
      scaleButtons.set(opt.id, b)
      row.appendChild(b)
    }
    titleScaleButtons()
    header.appendChild(row)
  }
  // The compare door, riding the header row.
  let compareBtn: HTMLButtonElement | null = null
  if (controls.onCompare) {
    compareBtn = document.createElement('button')
    compareBtn.type = 'button'
    compareBtn.className = 'qc-button qc-chip'
    compareBtn.dataset.role = 'legend-compare'
    compareBtn.textContent = '+'
    compareBtn.title = strings.t('legend.compare')
    compareBtn.addEventListener('click', () => controls.onCompare?.())
    header.appendChild(compareBtn)
  }

  const chipRows = document.createElement('div')
  chipRows.className = 'qc-legend-rows'
  root.append(header, chipRows)
  container.appendChild(root)

  const chipButton = (glyphOrText: string, titleText: string, onClick: () => void, isHtml = false): HTMLButtonElement => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'qc-legend-action'
    b.title = titleText
    if (isHtml) b.innerHTML = glyphOrText
    else b.textContent = glyphOrText
    b.addEventListener('click', onClick)
    return b
  }

  let lastChips: readonly LegendChip[] = []
  const render = (chips: readonly LegendChip[]): void => {
    chipRows.replaceChildren()
    for (const chip of chips) {
      const row = document.createElement('div')
      row.className = 'qc-legend-row'
      if (chip.hidden) row.dataset.qcHidden = 'true'
      // A titleButton row splits title from value: the title is the change-symbol door, and the
      // value stays plain text beside it.
      if (chip.titleButton && controls.onTitle) {
        const titleBtn = chipButton(chip.title, strings.t('legend.changeSymbol'), () => controls.onTitle!(chip.id))
        titleBtn.classList.add('qc-legend-title')
        row.appendChild(titleBtn)
        const rest = document.createElement('span')
        rest.textContent = chip.note ?? (chip.hidden || chip.value == null ? '' : chip.value)
        if (rest.textContent) row.appendChild(rest)
      } else {
        const label = document.createElement('span')
        label.textContent = chip.note ? `${chip.title} · ${chip.note}` : chip.hidden || chip.value == null ? chip.title : `${chip.title}  ${chip.value}`
        row.appendChild(label)
      }
      if (chip.hasInputs && controls.onSettings) {
        const gear = chipButton(
          GEAR,
          strings.t('legend.indicatorSettings'),
          () => {
            const r = gear.getBoundingClientRect()
            controls.onSettings!(chip.id, { x: r.x, y: r.y, w: r.width, h: r.height })
          },
          true,
        )
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
      row.appendChild(
        chipButton(
          chip.hidden ? EYE_OFF : EYE,
          chip.hidden ? strings.t('legend.showIndicator') : strings.t('legend.hideIndicator'),
          () => controls.onToggleEye(chip.id),
          true,
        ),
      )
      if (chip.removable && controls.onRemove) {
        row.appendChild(chipButton('×', strings.t('legend.removeCompare'), () => controls.onRemove!(chip.id)))
      }
      chipRows.appendChild(row)
    }
  }

  const unsubscribe = strings.onChange(() => {
    titleScaleButtons()
    if (compareBtn) compareBtn.title = strings.t('legend.compare')
    render(lastChips)
  })

  return {
    setHeader(symbol, tf) {
      title.textContent = symbol ? `${symbol} · ${tf}` : ''
    },
    setLeftInset(px) {
      root.style.left = `${RAIL_COLUMN_PX + Math.max(0, px)}px`
    },
    setDot(session) {
      dot.hidden = session === null
      if (session) dot.dataset.qcSession = session
    },
    syncScale(mode) {
      for (const [id, b] of scaleButtons) b.dataset.qcActive = id === mode ? 'true' : 'false'
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
