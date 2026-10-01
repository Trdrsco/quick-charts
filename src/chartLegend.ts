// The chart's legend: a quiet framework-free strip over the plot area. The header carries the
// market the chart is on as the datafeed resolved it (its display name, the interval, its venue),
// a market-status dot, the bar being read (open, high, low, close and the change against the
// previous close); beneath it sits one row per
// indicator instance (title, value, per-row controls: settings gear, pane collapse/maximize for
// pane-placed instances, the eye, the remove). The compare door is the toolbar's, not the header's.
// Same chrome discipline as the drawing toolbar:
// package-owned DOM, no framework, and every visual comes from a `.qc-*` recipe in the package
// stylesheet rather than a style string. Price-scale insets are written inline because they are
// calculated at runtime.
//
// The legend RENDERS; it computes nothing. Identity, prices and values arrive already resolved and
// already written by the chart's one symbol formatter, so a level here is the level the axis
// writes. Every control reports INTENT to the chart, which owns the state and re-renders; the
// legend never mutates chart state itself.
//
// It does own ONE measurement: how much of itself fits. `legendFit` decides, this module writes the
// answer onto the root as `data-qc-compact` and `data-qc-slim`, and the stylesheet stands the
// readouts down. Nothing is removed from the DOM by narrowing, so a wider pane brings the same
// nodes back rather than rebuilding them.
import { INITIAL_LEGEND_FIT, nextLegendFit, sameLegendFit, type LegendFit } from './legendFit'
import type { ChartI18n } from './i18n'
import type { SessionState } from './sessionModel'
import { ICONS } from './ui/controls/icons'
import { createSymbolBadge } from './ui/chrome/symbolBadge'
import type { MarkPainters } from './markPainters'
import type { IconResolver } from './ui/icons/resolver'

/** The box a market's mark stands in, per surface. Paired with the widths the stylesheet gives
 *  `.qc-symbol-badge` and `.qc-legend-row-mark`: the package owns the geometry and TELLS the host,
 *  so a host paints at the size it was given rather than guessing and being boxed inside it. */
const IDENTITY_MARK_SIZE = 18
const ROW_MARK_SIZE = 18

/** One legend row. `value` arrives pre-formatted (the chart owns precision); `note` is the
 *  instance's unavailable message, rendered instead of a value. */
export interface LegendChip {
  id: string
  title: string
  /** The instance's inputs, already worded as `(2, Close)`. It stands quiet after the title, so the
   *  title carries the study's short mark alone and never repeats the period or the source. */
  inputs?: string
  value: string | null
  /** The value's ink: the instance's effective primary plot colour, so the reading and the line it
   *  came from are the same colour. */
  color?: string
  note?: string
  hidden: boolean
  /** Host activity may be managed elsewhere, without a misleading hide or stop control. */
  hideable?: boolean
  settingsLabel?: string
  description?: string
  /** The instance declares inputs, so the settings gear renders. */
  hasInputs?: boolean
  /** Pane-placed instance: the row carries the pane controls. */
  pane?: boolean
  /** Live renderer pane, recalculated after removal and reordering. */
  paneIndex?: number
  /** The instance's pane currently reads as collapsed (drives which control shows). */
  collapsed?: boolean
  maximized?: boolean
  /** The TITLE is a button (a compare row's change-symbol door) — needs `onTitle`. */
  titleButton?: boolean
  /** The market this row charts, when the row IS a market: the head of the row wears its mark, the
   *  same one the header's identity wears, through the same host hook. A study is not a market and
   *  leaves this unset. */
  mark?: string
  /** Where the row's data comes from, written after the title. A narrow pane sheds it: the venue is
   *  the first thing worth losing when the row has to choose between saying where a price came from
   *  and saying what the price is. */
  venue?: string
  /** The direction the row's VALUE moved, when the value is a move rather than a level. A change
   *  reads in the market's own two colours; a price is a fact and takes the row's ink. */
  tone?: 'up' | 'down'
  /** The row carries a remove control (compares and indicators are legend-removable). */
  removable?: boolean
  /** The remove control's spoken name; the compare wording when absent. */
  removeLabel?: string
}

/** The market the chart is on, as the header writes it. `name` and `exchange` are the datafeed's
 *  resolved answer; until it lands, `name` is the charted symbol's own label and `exchange` is
 *  empty, because an unresolved symbol has no venue to attribute. */
export interface LegendIdentity {
  name: string
  /** The charted symbol itself, behind the display name. */
  symbol: string
  /** The interval, already worded (a running replay says so). */
  timeframe: string
  exchange: string
}

/** The bar the legend is reading: the one under the crosshair, else the last one painted. Every
 *  field is a STRING the chart already wrote through the symbol's own formatter. */
export interface LegendQuote {
  open: string
  high: string
  low: string
  close: string
  /** The move against the previous bar's close and its percentage, both null at the first painted
   *  bar, which has no previous close to move from. */
  change: string | null
  percent: string | null
  direction: 'up' | 'down' | 'flat'
}

export interface LegendControls {
  onToggleEye(id: string): void
  /** The row's settings gear was tapped — open the inputs editor at this viewport rect. */
  onSettings?(id: string, rect: { x: number; y: number; w: number; h: number }): void
  /** A pane row's collapse/maximize/restore control. */
  onPaneOp?(id: string, op: 'collapse' | 'maximize' | 'restore'): void
  /** A `titleButton` row's title was tapped (a compare's change-symbol). */
  onTitle?(id: string): void
  /** A `removable` row's remove control was tapped. */
  onRemove?(id: string): void
  /** The market's name was tapped. Present only when the chart serves symbol search; without it
   *  the name is a plain mark rather than a door. */
  onSymbol?(): void
  /** The market-status dot was tapped. Present only when the chart serves the status popup; without
   *  it the dot is a plain mark. The anchor is the dot's own button, for the popup to hang from. */
  onStatus?(anchor: HTMLElement): void
  /** The host's mark painters. The market's is called with the badge element and the symbol
   *  standing in it, on mount and on every symbol change; the returned disposer takes the previous
   *  mark down. With none lent, the badge wears the neutral monogram the package draws itself. */
  painters: MarkPainters
  /** Draws the legend's glyphs: the host's drawing for each icon, or the chart's own. */
  icons: IconResolver
}

export interface ChartLegend {
  /** The market the header names. */
  setIdentity(identity: LegendIdentity): void
  /** The bar being read, or null while the chart is painting none. */
  setQuote(quote: LegendQuote | null): void
  /** Price-scale widths and the time axis's height (px), keeping the legend and the corner slot
   *  inside the PLOT and clear of every axis. */
  setScaleInsets(left: number, right: number, axisHeight: number): void
  /** The chart paints close-only bars (line, area, baseline, step line), so the reading shows the
   *  close and the change alone however much room the pane has. */
  setValueShaped(shaped: boolean): void
  /** The session state the dot shows, or null to hide it. The dot's color is the state's own theme
   *  role, resolved by the stylesheet from the attribute written here. */
  setDot(state: SessionState | null, title?: string): void
  /** Where replay stands: off, waiting to be told where to start, or running. */
  setReplay(phase: 'off' | 'arming' | 'on'): void
  /** While ARMING, the pointer over the plot and the height of the time axis below it, or null when
   *  the pointer is off the plot. The axis height keeps the rule off its own labels; the pointer's
   *  y carries the shears, which stand in for the cursor the plot stops drawing. */
  setReplayGuide(point: { x: number; y: number } | null, axisHeight?: number): void
  setChips(chips: readonly LegendChip[]): void
  setPaneTops(tops: Readonly<Record<number, number>>): void
  destroy(): void
}


/** The four marks the quote group wears, in reading order: the catalog key that words each one and
 *  the field it labels. */
const OHLC = [
  { key: 'legend.open', field: 'open' },
  { key: 'legend.high', field: 'high' },
  { key: 'legend.low', field: 'low' },
  { key: 'legend.close', field: 'close' },
] as const

/** `strings` is the chart's language: every visible label reads through `strings.t` at render time,
 *  and the legend re-renders itself when the language changes, so a switch never leaves a stale
 *  title on a button that was drawn before it. */
export function mountChartLegend(container: HTMLElement, strings: ChartI18n, controls: LegendControls): ChartLegend {
  const root = document.createElement('div')
  root.className = 'qc-legend'
  root.style.insetInlineStart = '0px'
  for (const type of ['pointerdown', 'pointerup', 'pointermove'] as const) {
    root.addEventListener(type, (e) => e.stopPropagation())
  }

  const header = document.createElement('div')
  header.className = 'qc-legend-header'

  // ── The market. With search behind it the name is a door; without one it is a plain mark, which
  // is the honest reading of a chart whose host turned symbol search off.
  const name = document.createElement(controls.onSymbol ? 'button' : 'span')
  name.className = 'qc-legend-symbol'
  name.dataset.role = 'legend-symbol'
  if (name instanceof HTMLButtonElement) {
    name.type = 'button'
    name.setAttribute('aria-haspopup', 'dialog')
    name.addEventListener('click', () => controls.onSymbol?.())
  }
  const fact = (role: string): { sep: HTMLElement; text: HTMLElement } => {
    const sep = document.createElement('span')
    sep.className = 'qc-legend-sep'
    sep.dataset.role = `${role}-sep`
    sep.setAttribute('aria-hidden', 'true')
    const text = document.createElement('span')
    text.className = 'qc-legend-fact'
    text.dataset.role = role
    return { sep, text }
  }
  const timeframe = fact('legend-timeframe')
  const venue = fact('legend-exchange')
  const badge = createSymbolBadge('')
  // The market and its facts are one band, held apart from the reading beside them so the pointer
  // shades the identity alone. The header wraps the two bands; this one never wraps inside itself.
  const identityBand = document.createElement('span')
  identityBand.className = 'qc-legend-identity'
  identityBand.append(badge.element, name, timeframe.sep, timeframe.text, venue.sep, venue.text)

  const dot = controls.icons.glyph(ICONS.marketStatus, { size: 18, className: 'qc-legend-dot' })
  // With a status surface behind it the dot rides a button: the market-status control, named for
  // a screen reader, opening the popup at itself. Without one the dot is a plain mark.
  let statusButton: HTMLButtonElement | null = null
  if (controls.onStatus) {
    statusButton = document.createElement('button')
    statusButton.type = 'button'
    statusButton.className = 'qc-legend-action qc-legend-status'
    statusButton.setAttribute('aria-haspopup', 'dialog')
    statusButton.setAttribute('aria-expanded', 'false')
    statusButton.title = strings.t('status.title')
    statusButton.setAttribute('aria-label', strings.t('status.title'))
    statusButton.addEventListener('click', () => controls.onStatus?.(statusButton!))
    statusButton.appendChild(dot)
    identityBand.appendChild(statusButton)
  } else {
    identityBand.appendChild(dot)
  }
  const replayPill = document.createElement('span')
  replayPill.className = 'qc-legend-replay'
  replayPill.hidden = true
  replayPill.title = strings.t('replay.watermark')
  replayPill.append(controls.icons.glyph(ICONS.replayStatus, { size: 18 }))
  identityBand.appendChild(replayPill)
  header.appendChild(identityBand)
  // This belongs to the chart's own replay state, not the widget-level transport owner. Concurrent
  // replay panes therefore keep independent marks even though only one owns the transport row.
  const replayWatermark = document.createElement('span')
  replayWatermark.className = 'qc-replay-watermark'
  replayWatermark.hidden = true
  replayWatermark.setAttribute('aria-hidden', 'true')
  replayWatermark.append(controls.icons.glyph(ICONS.replayMark, { size: 52 }))
  const replayWatermarkText = document.createElement('span')
  replayWatermark.append(replayWatermarkText)
  container.appendChild(replayWatermark)
  replayWatermarkText.textContent = strings.t('replay.watermark')
  // The arming guide: a rule where the pointer is and a wash over everything after it. Replay
  // starts at the bar under the pointer, so what is dimmed is the future the viewer is about to
  // rewind past — the shading is the question being asked, not decoration. It lives here beside the
  // replayWatermark because both are marks of the same session on the same plot.
  const replayGuide = document.createElement('span')
  replayGuide.className = 'qc-replay-guide'
  replayGuide.hidden = true
  replayGuide.setAttribute('aria-hidden', 'true')
  // The shears ride the rule at the pointer. The cut is the whole point of the gesture, so the mark
  // says it in one glance where a bare line only says "something is at this x", and it stands in
  // for the pointer the plot stops drawing while the question is open.
  const replayCut = controls.icons.glyph(ICONS.replayCut, { size: 18, className: 'qc-replay-cut' })
  replayGuide.appendChild(replayCut)
  container.appendChild(replayGuide)

  // ── The bar being read: the four marks with their prices, then the change against the previous
  // close. The direction is written as an attribute, so the stylesheet owns the ink.
  const quote = document.createElement('span')
  quote.className = 'qc-legend-quote'
  quote.dataset.role = 'legend-quote'
  quote.hidden = true
  const marks = new Map<string, HTMLElement>()
  const prices = new Map<string, HTMLElement>()
  for (const entry of OHLC) {
    const group = document.createElement('span')
    group.className = 'qc-legend-ohlc'
    group.dataset.qcOhlc = entry.field
    const mark = document.createElement('span')
    mark.className = 'qc-legend-mark'
    const price = document.createElement('span')
    group.append(mark, price)
    quote.appendChild(group)
    marks.set(entry.field, mark)
    prices.set(entry.field, price)
  }
  const change = document.createElement('span')
  change.className = 'qc-legend-change'
  change.dataset.role = 'legend-change'
  quote.appendChild(change)
  header.appendChild(quote)

  const chipRows = document.createElement('div')
  chipRows.className = 'qc-legend-rows'
  const listToggle = document.createElement('button')
  listToggle.type = 'button'
  listToggle.className = 'qc-legend-action qc-legend-collapse'
  listToggle.dataset.role = 'legend-collapse'
  listToggle.setAttribute('aria-expanded', 'true')
  listToggle.hidden = true
  let rowsCollapsed = false
  const paintToggle = (): void => {
    root.dataset.rowsCollapsed = String(rowsCollapsed)
    listToggle.setAttribute('aria-expanded', String(!rowsCollapsed))
    listToggle.title = strings.t(rowsCollapsed ? 'legend.showRows' : 'legend.hideRows')
    listToggle.setAttribute('aria-label', listToggle.title)
    listToggle.replaceChildren(controls.icons.glyph(ICONS.legendChevron, { size: 15 }))
  }
  listToggle.addEventListener('click', () => { rowsCollapsed = !rowsCollapsed; paintToggle() })
  // Main rows and their list toggle stay in flow after the wrapping header. Locale, metadata and
  // width changes therefore move them by measured layout instead of a fixed top guess.
  root.append(header, chipRows, listToggle)
  paintToggle()
  container.appendChild(root)

  // The product's mark, in the plot's corner. Every chart carries it and no option removes it: it is
  // the attribution the library is given away on, not decoration and not a host slot. It follows the
  // plot rather than the widget's floor, so a comparison's second scale moves it in and a transport
  // row opening below the grid carries it up with the pane. Quiet ink and no pointer: a signature,
  // never a control, and never over a number.
  const plotCorner = document.createElement('div')
  plotCorner.className = 'qc-plot-corner'
  plotCorner.setAttribute('aria-hidden', 'true')
  plotCorner.appendChild(controls.icons.glyph(ICONS.productMark, { size: 28 }))
  container.appendChild(plotCorner)

  const chipButton = (glyphOrText: string | HTMLElement, titleText: string, onClick: () => void): HTMLButtonElement => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'qc-legend-action'
    b.title = titleText
    if (typeof glyphOrText === 'string') b.textContent = glyphOrText
    else b.appendChild(glyphOrText)
    b.addEventListener('click', onClick)
    return b
  }

  let lastChips: readonly LegendChip[] = []
  const groups = new Map<number, HTMLElement>([[0, chipRows]])
  chipRows.dataset.legendPane = '0'
  const rows = new Map<string, { root: HTMLElement; update(chip: LegendChip): void; release(): void }>()
  const groupFor = (pane: number): HTMLElement => {
    let group = groups.get(pane)
    if (!group) {
      group = document.createElement('div')
      group.className = 'qc-legend-rows qc-legend-pane'
      group.dataset.legendPane = String(pane)
      root.appendChild(group)
      groups.set(pane, group)
    }
    return group
  }
  const makeRow = (initial: LegendChip) => {
    let chip = initial
    const row = document.createElement('div')
    row.className = 'qc-legend-row'
    row.dataset.legendRow = initial.id
    const label = document.createElement('span')
    label.className = 'qc-legend-label'
    const labelName = document.createElement('span')
    const labelInputs = document.createElement('span')
    labelInputs.className = 'qc-legend-inputs'
    label.append(labelName, labelInputs)
    const title = chipButton('', '', () => controls.onTitle?.(chip.id))
    title.classList.add('qc-legend-title')
    const rowMark = createSymbolBadge('')
    rowMark.element.classList.add('qc-legend-row-mark')
    /** The market this row's mark was painted for, and what takes a host's mark down again. */
    let markPainted: string | null = null
    let dropMark: (() => void) | null = null
    const venueSep = document.createElement('span')
    venueSep.className = 'qc-legend-sep qc-legend-row-venue'
    const venueText = document.createElement('span')
    venueText.className = 'qc-legend-venue qc-legend-row-venue'
    const value = document.createElement('span')
    value.className = 'qc-legend-value'
    value.dataset.role = 'legend-study-value'
    const gear = chipButton(controls.icons.glyph(ICONS.legendSettings, { size: 18 }), '', () => {
      const r = gear.getBoundingClientRect()
      controls.onSettings?.(chip.id, { x: r.x, y: r.y, w: r.width, h: r.height })
    })
    const collapse = chipButton('', '', () => controls.onPaneOp?.(chip.id, chip.collapsed ? 'restore' : 'collapse'))
    const maximize = chipButton(controls.icons.glyph(ICONS.paneMaximize, { size: 18 }), '', () => controls.onPaneOp?.(chip.id, chip.maximized ? 'restore' : 'maximize'))
    const eye = chipButton('', '', () => controls.onToggleEye(chip.id))
    eye.classList.add('qc-legend-eye')
    const remove = chipButton(controls.icons.glyph(ICONS.trash, { size: 18 }), '', () => controls.onRemove?.(chip.id))
    const actions = document.createElement('span')
    actions.className = 'qc-legend-actions'
    actions.append(eye, gear, collapse, maximize, remove)
    const nameButton = (button: HTMLButtonElement, text: string): void => {
      button.title = text
      button.setAttribute('aria-label', text)
    }
    row.append(rowMark.element, label, title, venueSep, venueText, value, actions)
    return {
      root: row,
      update(next: LegendChip) {
        chip = next
        row.dataset.qcHidden = String(chip.hidden)
        row.title = chip.description ?? ''
        // A market row leads with its own mark; a study has none and the head of the row closes up.
        // The mark goes through the SAME host hook the header's does, so a host that supplies
        // artwork supplies it everywhere a market is named, and one that does not gets the package's
        // monogram in both places. Repainted only when the market changes: a host's mark may be an
        // image, and tearing one down every tick would flicker.
        rowMark.element.hidden = !chip.mark
        if (!chip.mark) {
          dropMark?.()
          dropMark = null
          markPainted = null
        } else if (markPainted !== chip.mark) {
          dropMark?.()
          dropMark = null
          markPainted = chip.mark
          rowMark.element.replaceChildren()
          const drop = controls.painters.symbol?.({ symbol: chip.mark, host: rowMark.element, size: ROW_MARK_SIZE })
          if (typeof drop === 'function') {
            rowMark.element.dataset.qcHost = 'true'
            dropMark = drop
          } else {
            delete rowMark.element.dataset.qcHost
            rowMark.set(chip.title)
          }
        }
        venueSep.hidden = !chip.venue
        venueText.hidden = !chip.venue
        venueText.textContent = chip.venue ?? ''
        const clickable = !!chip.titleButton && !!controls.onTitle
        label.hidden = clickable
        title.hidden = !clickable
        labelName.textContent = clickable ? '' : chip.title
        labelInputs.textContent = !clickable && chip.inputs ? ` ${chip.inputs}` : ''
        title.textContent = clickable ? chip.title : ''
        nameButton(title, strings.t('legend.changeSymbol'))
        value.textContent = chip.note ?? (chip.hidden ? '' : chip.value ?? '')
        value.style.color = chip.color && !chip.hidden && !chip.note ? chip.color : ''
        // A move is written in the market's colours; a plot's own colour never overrides that,
        // because the two say different things and only one of them is about the number.
        if (chip.tone && !chip.hidden && !chip.note) value.dataset.qcTone = chip.tone
        else delete value.dataset.qcTone
        gear.hidden = !chip.hasInputs || !controls.onSettings
        nameButton(gear, chip.settingsLabel ?? strings.t('legend.indicatorSettings'))
        collapse.hidden = !chip.pane || !controls.onPaneOp || chip.hidden
        collapse.replaceChildren(controls.icons.glyph(chip.collapsed ? ICONS.paneRestore : ICONS.paneCollapse, { size: 18 }))
        nameButton(collapse, strings.t(chip.collapsed ? 'legend.restorePane' : 'legend.collapsePane'))
        maximize.hidden = collapse.hidden || !!chip.collapsed
        nameButton(maximize, strings.t(chip.maximized ? 'legend.restorePane' : 'legend.maximizePane'))
        maximize.setAttribute('aria-pressed', String(chip.maximized === true))
        const eyeState = String(chip.hidden)
        if (eye.dataset.hidden !== eyeState) {
          eye.replaceChildren(controls.icons.glyph(chip.hidden ? ICONS.legendEyeOff : ICONS.legendEye, { size: 18 }))
          eye.dataset.hidden = eyeState
        }
        nameButton(eye, strings.t(chip.hidden ? 'legend.showIndicator' : 'legend.hideIndicator'))
        eye.hidden = chip.hideable === false
        remove.hidden = !chip.removable || !controls.onRemove
        nameButton(remove, chip.removeLabel ?? strings.t('legend.removeCompare'))
      },
      /** Give a host's mark back before the row leaves, so nothing the host owns outlives the row
       *  it was painted into. */
      release() {
        dropMark?.()
        dropMark = null
        markPainted = null
      },
    }
  }
  const render = (chips: readonly LegendChip[]): void => {
    listToggle.hidden = chips.length === 0
    paintToggle()
    const keep = new Set(chips.map(chip => chip.id))
    for (const [id, row] of rows) if (!keep.has(id)) { row.release(); row.root.remove(); rows.delete(id) }
    const previous = new Map<number, HTMLElement>()
    for (const chip of chips) {
      let row = rows.get(chip.id)
      if (!row) { row = makeRow(chip); rows.set(chip.id, row) }
      row.update(chip)
      const pane = chip.paneIndex ?? 0
      const group = groupFor(pane)
      const before = previous.get(pane)?.nextSibling ?? (previous.has(pane) ? null : group.firstChild)
      if (row.root.parentElement !== group || before !== row.root) {
        const focused = row.root.contains(document.activeElement) ? document.activeElement as HTMLElement : null
        group.insertBefore(row.root, before)
        if (focused?.isConnected && document.activeElement === document.body) focused.focus({ preventScroll: true })
      }
      previous.set(pane, row.root)
    }
    for (const [pane, group] of groups) if (pane > 0 && !previous.has(pane)) { group.remove(); groups.delete(pane) }
  }
  // ── How much of the legend fits. The decision is `legendFit`'s; what happens here is the
  // measuring and the writing. Widths come off the live DOM, so under a layout-free test
  // environment every width reads zero, the decision stays at its opening answer, and the recipes
  // below are exercised by setting the state directly.
  let fit: LegendFit = INITIAL_LEGEND_FIT
  let valueShaped = false
  const paintFit = (): void => {
    root.dataset.qcCompact = String(fit.compact)
    root.dataset.qcSlim = String(fit.slim)
  }
  const measure = (): void => {
    const next = nextLegendFit(fit, {
      paneWidth: container.clientWidth,
      quoteWidth: quote.hidden ? 0 : quote.getBoundingClientRect().width,
      legendWidth: root.getBoundingClientRect().width,
      valueShaped,
    })
    if (sameLegendFit(fit, next)) return
    fit = next
    paintFit()
  }
  paintFit()
  // The legend's own width answers the reading; the plot's answers slim. Both are watched, because
  // a price scale widening changes the first without changing the second.
  const fitObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => measure())
  fitObserver?.observe(root)
  fitObserver?.observe(container)

  let identity: LegendIdentity | null = null
  let reading: LegendQuote | null = null
  /** The market the host's mark was painted for, and what takes that mark down again. A host badge
   *  owns the badge element outright, so the monogram is not written under it. */
  let badgePainted: string | null = null
  let dropBadge: (() => void) | null = null
  const paintBadge = (): void => {
    if (!controls.painters.symbol) {
      badge.set(identity?.name ?? '')
      return
    }
    const symbol = identity?.symbol ?? ''
    if (symbol === badgePainted) return
    dropBadge?.()
    dropBadge = null
    badge.element.replaceChildren()
    badgePainted = symbol
    badge.element.dataset.qcHost = 'true'
    if (symbol) dropBadge = controls.painters.symbol({ symbol, host: badge.element, size: IDENTITY_MARK_SIZE }) ?? null
  }
  const paintIdentity = (): void => {
    paintBadge()
    name.textContent = identity?.name ?? ''
    name.title = identity?.symbol ?? ''
    timeframe.text.textContent = identity?.timeframe ?? ''
    timeframe.text.hidden = !identity?.timeframe
    timeframe.sep.hidden = !identity?.timeframe
    venue.text.textContent = identity?.exchange ?? ''
    venue.text.hidden = !identity?.exchange
    venue.sep.hidden = !identity?.exchange
  }
  const paintQuote = (): void => {
    quote.hidden = reading === null
    if (!reading) return
    for (const entry of OHLC) {
      marks.get(entry.field)!.textContent = strings.t(entry.key)
      prices.get(entry.field)!.textContent = reading[entry.field]
    }
    quote.dataset.qcDirection = reading.direction
    change.textContent =
      reading.change === null || reading.percent === null ? '' : strings.t('legend.change', { change: reading.change, percent: reading.percent })
  }

  const unsubscribe = strings.onChange(() => {
    if (statusButton) {
      statusButton.title = strings.t('status.title')
      statusButton.setAttribute('aria-label', strings.t('status.title'))
    }
    replayPill.title = strings.t('replay.watermark')
    replayWatermarkText.textContent = strings.t('replay.watermark')
    paintQuote()
    render(lastChips)
  })

  return {
    setIdentity(next) {
      const switched = identity?.symbol !== next.symbol
      identity = next
      paintIdentity()
      if (switched && fit.compact && !valueShaped) {
        fit = { ...INITIAL_LEGEND_FIT, slim: fit.slim }
        paintFit()
      }
      measure()
    },
    setQuote(next) {
      reading = next
      paintQuote()
      measure()
    },
    setScaleInsets(left, right, axisHeight) {
      const rtl = getComputedStyle(root).direction === 'rtl'
      const start = Math.max(0, rtl ? right : left)
      root.style.insetInlineStart = `${start}px`
      root.style.insetInlineEnd = `${Math.max(0, rtl ? left : right)}px`
      // The corner answers to the PLOT, not to the pane: a scale that appears beside it moves it in
      // and the time axis holds it up, so it never stands over a number.
      plotCorner.style.insetInlineStart = `${start}px`
      plotCorner.style.insetBlockEnd = `${Math.max(0, axisHeight)}px`
    },
    setValueShaped(shaped) {
      if (shaped === valueShaped) return
      valueShaped = shaped
      measure()
      // Leaving a close-only style has nothing latched to release, so the full reading returns at
      // once and re-measures itself on the next frame the pane gives it.
      if (!shaped && fit.compact) {
        fit = { ...fit, compact: false, compactAt: 0 }
        paintFit()
      }
    },
    setDot(state, title) {
      dot.dataset.qcSession = state ?? 'unknown'
      if (statusButton) statusButton.title = title ?? strings.t('status.unknownTitle')
    },
    setReplay(phase) {
      // ARMING is already replay as far as the chart's identity is concerned: the transport is up
      // and the market status is not what the header is about any more. What separates the two is
      // the MARK — quiet while the question is still being asked, lit once there is a past to play.
      const on = phase !== 'off'
      if (statusButton) statusButton.hidden = on
      else dot.hidden = on
      replayPill.hidden = !on
      replayPill.dataset.qcPhase = phase
      // replayWatermark names WHICH chart replay has taken over, and arming has already taken it
      // over: the plot is answering a click with a starting point instead of its usual gestures.
      replayWatermark.hidden = !on
      // While the question is open the plot draws NO pointer of its own: the shears on the rule are
      // the pointer, and a crosshair beside them would be a second answer to where the click lands.
      // The mark goes on the pane, because the surface the pointer is over is the renderer's canvas
      // beside this chrome rather than the chrome itself.
      const pane = container.closest('.qc-pane') ?? container
      if (phase === 'arming') pane.setAttribute('data-qc-replay-arming', 'true')
      else pane.removeAttribute('data-qc-replay-arming')
      if (phase !== 'arming') {
        replayGuide.hidden = true
        replayGuide.style.removeProperty('inset-inline-start')
      }
    },
    setReplayGuide(point, axisHeight = 0) {
      // A pointer off the plot has no bar under it, so the guide leaves rather than freezing where
      // the pointer was last seen and implying a choice nobody is pointing at.
      replayGuide.hidden = point === null
      if (point === null) return
      replayGuide.style.insetInlineStart = `${point.x}px`
      // The rule stops where the PLOT stops. Running it through the time axis would put it over the
      // axis's own labels, including the crosshair label naming the very moment it is pointing at.
      replayGuide.style.insetBlockEnd = `${axisHeight}px`
      // The shears ARE the cursor here, so they ride the pointer rather than resting at a fixed
      // height: the plot draws no pointer of its own while the question is open.
      replayCut.style.insetBlockStart = `${point.y}px`
    },
    setChips(chips) {
      lastChips = chips
      render(chips)
    },
    setPaneTops(tops) {
      for (const [pane, group] of groups) if (pane > 0) group.style.top = `${tops[pane] ?? 0}px`
    },
    destroy() {
      dropBadge?.()
      dropBadge = null
      fitObserver?.disconnect()
      unsubscribe()
      root.remove()
      replayWatermark.remove()
    },
  }
}
