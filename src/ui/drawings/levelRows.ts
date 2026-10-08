// The settings rows of the leveled tools: the levels themselves, the one color that recolors every
// level at once, the opacity the bands between levels are filled at, and the thickness and style
// every level line is drawn in.
//
// A fib's levels stand in a grid two to a line, each level its switch, its value and its color. A
// level switched off keeps its value and color, its field greyed and its well dimmed until it is
// switched back on. The one color shows the color every level shares, or a well split in two while
// they differ; picking there gives every level the color picked.
import type { DrawingStyle, FibChannelProps, FibLevel, FibRetracementProps, LineStyle } from '../../internal/drawings/index'
import { alphaOf, fibLevelColor, MIXED_LEVEL_COLORS, sharedLevelColor, withAlpha } from '../../internal/drawings/index'
import type { ChartMessageKey, ChartTranslate } from '../../i18n'
import { el, menuKeys } from './dom'
import { checkbox, checkRow, dropdown, fullRow, groupGap, multiDropdown, numberInput, openPopover, row, swatchButton, toggleRow } from './fields'
import type { RowsContext } from './settingsRows'

const SIDE_LABEL: Record<string, ChartMessageKey> = { left: 'drawing.left', center: 'drawing.center', right: 'drawing.right' }
const ACROSS_LABEL: Record<string, ChartMessageKey> = { top: 'drawing.top', middle: 'drawing.middle', bottom: 'drawing.bottom' }
const VALUES_LABEL: Record<string, ChartMessageKey> = { values: 'drawing.values', percents: 'drawing.percents' }
const STYLE_LABEL: Record<LineStyle, ChartMessageKey> = { solid: 'drawing.lineSolid', dashed: 'drawing.lineDashed', dotted: 'drawing.lineDotted' }
const STYLE_ICON = { solid: 'lineSolid', dashed: 'lineDashed', dotted: 'lineDotted' } as const

/** The sizes a fib's labels are offered in. */
const LABEL_SIZES = ['8', '10', '11', '12', '14', '16', '18', '20', '22', '24'] as const

/** The thicknesses a level line is offered in. */
const THICKNESSES = [1, 2, 3, 4] as const

const label = (t: ChartTranslate, table: Record<string, ChartMessageKey>) => (value: string): string => (table[value] ? t(table[value]!) : value)

/** A list button whose face is a mark rather than words: a level line's thickness, a 76px field
 *  holding a 50px bar of the chosen width, or its style, a 34px field holding the style's 28px mark.
 *  Its list opens under it, each choice drawn by its mark, the chosen one inverted. */
function markSelect<T extends string | number>(
  box: HTMLElement,
  props: { label: string; kind: 'thickness' | 'style'; options: readonly T[]; value: T; mark(v: T): Element; name(v: T): string; named: boolean; onChange(v: T): void },
): HTMLButtonElement {
  const b = el('button', {
    type: 'button',
    class: 'qc-field qc-drawing-select qc-drawing-select--mark',
    role: 'combobox',
    'aria-label': props.label,
    'aria-haspopup': 'listbox',
    'aria-expanded': 'false',
    'data-mark': props.kind,
  }) as HTMLButtonElement
  b.appendChild(props.mark(props.value))
  b.addEventListener('keydown', (event) => {
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && b.getAttribute('aria-expanded') !== 'true') {
      event.preventDefault()
      b.click()
    }
  })
  let close: (() => void) | null = null
  b.addEventListener('click', () => {
    if (close) {
      close()
      return
    }
    const list = el('div', { class: 'qc-drawing-menu qc-drawing-list qc-drawing-select-list qc-drawing-mark-list', role: 'listbox', 'aria-label': props.label, 'data-mark': props.kind })
    for (const option of props.options) {
      const opt = el(
        'button',
        { type: 'button', class: `qc-menu-row qc-drawing-list-row${props.named ? ' qc-drawing-list-row--mark' : ' qc-drawing-list-row--bar'}`, role: 'option', 'aria-selected': String(option === props.value), 'aria-label': props.name(option) },
        props.mark(option),
        props.named ? el('span', { class: 'qc-menu-label', text: props.name(option) }) : null,
      )
      opt.addEventListener('click', () => {
        close?.()
        b.focus({ preventScroll: true })
        if (option !== props.value) props.onChange(option)
      })
      list.appendChild(opt)
    }
    const rows = (): HTMLElement[] => [...list.querySelectorAll<HTMLElement>('[role="option"]')]
    const unkeys = menuKeys(list, rows)
    close = openPopover(box, b, list, 'below', () => {
      unkeys()
      close = null
    }, b, undefined, { gap: 0, className: 'qc-drawing-popover--list' })
    ;(rows().find((r) => r.getAttribute('aria-selected') === 'true') ?? rows()[0])?.focus({ preventScroll: true })
  })
  return b
}

/** A bar as thick as a level line, in the ink of what holds it. */
function thicknessBar(width: number): HTMLElement {
  const bar = el('span', { class: 'qc-drawing-thickness-bar', 'aria-hidden': 'true' })
  bar.style.height = `${width}px`
  return bar
}

/** The thickness every level line is drawn at. */
export function thicknessSelect(ctx: RowsContext, value: number, onChange: (v: number) => void): HTMLButtonElement {
  const { t } = ctx
  const current = (THICKNESSES as readonly number[]).includes(value) ? value : 1
  return markSelect(ctx.box, {
    label: t('drawing.thickness'),
    kind: 'thickness',
    options: THICKNESSES as readonly number[],
    value: current,
    mark: thicknessBar,
    name: (w) => t('drawing.thicknessValue', { n: w }),
    named: false,
    onChange,
  })
}

/** The style every level line is drawn in: solid, dashed or dotted. */
export function lineStyleSelect(ctx: RowsContext, value: LineStyle, onChange: (v: LineStyle) => void): HTMLButtonElement {
  const { t, icons } = ctx
  return markSelect(ctx.box, {
    label: t('drawing.lineStyle'),
    kind: 'style',
    options: ['solid', 'dashed', 'dotted'] as const,
    value,
    mark: (s) => icons.icon(STYLE_ICON[s], 28),
    name: (s) => t(STYLE_LABEL[s]),
    named: true,
    onChange,
  })
}

/** The opacity the bands between levels are filled at: a 148px track that fades into the drawings'
 *  fill color over a checked ground, its knob standing at the opacity. Moving it writes quietly, so
 *  the track keeps the pointer while it is dragged. */
export function opacityTrack(t: ChartTranslate, value: number, onChange: (v: number) => void): HTMLInputElement {
  const track = el('input', { type: 'range', min: '0', max: '100', step: '1', class: 'qc-drawing-band-opacity', 'aria-label': t('drawing.backgroundOpacity') }) as HTMLInputElement
  track.value = String(Math.round(Math.min(1, Math.max(0, value)) * 100))
  track.addEventListener('input', () => onChange(Number(track.value) / 100))
  return track
}

/** The levels as the drawing holds them NOW. Every change replaces the whole array, so a control
 *  built before an earlier edit reads the current one rather than writing its own copy back and
 *  undoing what came between. */
const liveLevels = (ctx: RowsContext): FibLevel[] => (Array.isArray(ctx.drawing.props.levels) ? (ctx.drawing.props.levels as FibLevel[]) : [])

/** One level's three controls: its switch, its value and its color. Switching a level off greys
 *  its field and dims its well in place, and the value writes quietly, so neither rebuilds the page
 *  under the keyboard. */
function levelCell(ctx: RowsContext, level: FibLevel, index: number): HTMLElement[] {
  const { t, box, icons } = ctx
  const n = index + 1
  const patch = (next: Partial<FibLevel>, quiet: boolean): void => {
    const levels = liveLevels(ctx).map((l, j) => (j === index ? { ...l, ...next } : l))
    if (quiet) ctx.patchQuiet({ levels })
    else ctx.patchProps({ levels })
  }
  const value = numberInput(t, icons, { label: t('drawing.levelValue', { n }), value: level.value, step: 0.1, width: 'field', onChange: (v) => patch({ value: v }, true) })
  const color = fibLevelColor(level, index)
  const well = swatchButton(t, box, { label: t('drawing.levelColor', { n }), value: color, onPick: (c) => patch({ color: c }, false) })
  const shown = (on: boolean): void => {
    for (const control of value.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button')) control.disabled = !on
    well.dataset.qcDim = String(!on)
  }
  shown(level.visible)
  const toggle = checkbox(t('drawing.levelOn', { n }), level.visible, (on) => {
    shown(on)
    patch({ visible: on }, true)
  })
  return [toggle, value, well]
}

/** A fib's levels two to a line, in their order, and the room the grid keeps after it. */
export function levelPairs(ctx: RowsContext): HTMLElement[] {
  const levels = liveLevels(ctx)
  const out: HTMLElement[] = []
  for (let i = 0; i < levels.length; i += 2) {
    const line = fullRow(...levelCell(ctx, levels[i]!, i), ...(i + 1 < levels.length ? levelCell(ctx, levels[i + 1]!, i + 1) : []))
    line.classList.add('qc-drawing-level-row')
    out.push(line)
  }
  out.push(groupGap())
  return out
}

/** The one color every level takes: the color they share, or the split well while they differ. A
 *  pick gives every level the color, and the drawing's stroke with it, so the settings bar shows it
 *  too. */
export function oneColorRow(ctx: RowsContext): HTMLElement {
  const { t, drawing, box } = ctx
  const shared = sharedLevelColor(liveLevels(ctx))
  const well = swatchButton(t, box, {
    label: t('drawing.useOneColor'),
    value: shared ?? MIXED_LEVEL_COLORS[0],
    onPick: (c) => {
      drawing.updateStyle({ lineColor: c })
      ctx.patchProps({ levels: liveLevels(ctx).map((l) => ({ ...l, color: c })) })
    },
  })
  if (!shared) {
    well.dataset.qcMixed = 'true'
    well.style.setProperty('--qcd-paired', MIXED_LEVEL_COLORS[1])
  }
  return row(t('drawing.useOneColor'), well)
}

/** The Background row of a leveled tool: its switch, and the opacity of its bands. */
export function bandsRow(ctx: RowsContext): HTMLElement {
  const { t, drawing } = ctx
  const props = drawing.props as { fillBackground?: boolean; backgroundOpacity?: number }
  return checkRow(t('drawing.background'), props.fillBackground !== false, (v) => ctx.patchProps({ fillBackground: v }), [
    opacityTrack(t, Number(props.backgroundOpacity ?? 0.2), (v) => ctx.patchQuiet({ backgroundOpacity: v })),
  ])
}

/** The Style page of a retracement, an extension and a fib channel: the trend line (not a channel's),
 *  the levels' stroke, the extensions, the level grid, the one color, the bands, which swing point is
 *  level 0 (not a channel's), what the labels read and where they stand, the levels' own words and
 *  where they stand (not a channel's), the labels' size, and log price levels (not a channel's). */
export function fibRows(ctx: RowsContext, retracement: boolean): HTMLElement[] {
  const { t, drawing, box, icons } = ctx
  const props = drawing.props as FibChannelProps & Partial<FibRetracementProps>
  const style: Readonly<DrawingStyle> = drawing.style
  const out: HTMLElement[] = []
  if (retracement) {
    const color = String(props.trendLineColor)
    out.push(
      checkRow(t('drawing.trendLine'), !!props.trendLine, (v) => ctx.patchProps({ trendLine: v }), [
        swatchButton(t, box, {
          label: t('drawing.trendLine'),
          value: color,
          onPick: (c) => {
            const alpha = alphaOf(color)
            ctx.patchProps({ trendLineColor: alpha < 1 ? withAlpha(c, alpha) : c })
          },
          opacity: alphaOf(color),
          onOpacity: (v) => ctx.patchProps({ trendLineColor: withAlpha(color, v) }),
          thickness: Number(props.trendLineWidth),
          onThickness: (v) => ctx.patchProps({ trendLineWidth: v }),
          lineStyle: props.trendLineStyle,
          onLineStyle: (v) => ctx.patchProps({ trendLineStyle: v }),
        }),
      ]),
    )
  }
  out.push(
    row(
      t('drawing.levelsLine'),
      thicknessSelect(ctx, style.lineWidth, (v) => ctx.patchStyle({ lineWidth: v })),
      lineStyleSelect(ctx, style.lineStyle, (v) => ctx.patchStyle({ lineStyle: v })),
    ),
    row(
      t('drawing.extend'),
      multiDropdown(icons, box, {
        label: t('drawing.extend'),
        empty: t('drawing.extendNone'),
        choices: [
          { label: t(retracement ? 'drawing.extendLinesLeft' : 'drawing.extendLeft'), checked: !!props.extendLeft, onChange: (v) => ctx.patchQuiet({ extendLeft: v }) },
          { label: t(retracement ? 'drawing.extendLinesRight' : 'drawing.extendRight'), checked: !!props.extendRight, onChange: (v) => ctx.patchQuiet({ extendRight: v }) },
        ],
      }),
    ),
    ...levelPairs(ctx),
    oneColorRow(ctx),
    bandsRow(ctx),
  )
  if (retracement) out.push(toggleRow(t('drawing.reverse'), !!props.reverse, (v) => ctx.patchProps({ reverse: v })))
  out.push(
    toggleRow(t('drawing.prices'), !!props.showPrices, (v) => ctx.patchProps({ showPrices: v })),
    checkRow(t('drawing.levels'), !!props.showLevels, (v) => ctx.patchProps({ showLevels: v }), [
      dropdown(icons, box, t('drawing.levels'), ['values', 'percents'] as const, props.coeffsAsPercents ? 'percents' : 'values', label(t, VALUES_LABEL), (v) => ctx.patchProps({ coeffsAsPercents: v === 'percents' })),
    ]),
    row(
      t('drawing.labels'),
      dropdown(icons, box, t('drawing.labels'), ['left', 'center', 'right'] as const, props.labelsHAlign, label(t, SIDE_LABEL), (v) => ctx.patchProps({ labelsHAlign: v })),
      dropdown(icons, box, t('drawing.labels'), ['top', 'middle', 'bottom'] as const, props.labelsVAlign, label(t, ACROSS_LABEL), (v) => ctx.patchProps({ labelsVAlign: v })),
    ),
  )
  if (retracement) {
    out.push(
      checkRow(t('drawing.levelWords'), !!props.showText, (v) => ctx.patchProps({ showText: v }), [
        dropdown(icons, box, t('drawing.levelWords'), ['left', 'center', 'right'] as const, props.textHAlign ?? 'center', label(t, SIDE_LABEL), (v) => ctx.patchProps({ textHAlign: v })),
        dropdown(icons, box, t('drawing.levelWords'), ['top', 'middle', 'bottom'] as const, props.textVAlign ?? 'middle', label(t, ACROSS_LABEL), (v) => ctx.patchProps({ textVAlign: v })),
      ]),
    )
  }
  // A size the list does not offer still reads on the face as the size the labels are drawn at.
  out.push(row(t('drawing.fontSize'), dropdown(icons, box, t('drawing.fontSize'), LABEL_SIZES, String(style.fontSize) as (typeof LABEL_SIZES)[number], (v) => v, (v) => ctx.patchStyle({ fontSize: Number(v) }))))
  if (retracement) {
    // Log levels mean something only over a logarithmic price scale, so the switch waits for one.
    const logScale = drawing.getViewport()?.logScale === true
    out.push(toggleRow(t('drawing.levelsOnLogScale'), !!props.levelsOnLogScale, (v) => ctx.patchProps({ levelsOnLogScale: v }), !logScale))
  }
  return out
}
