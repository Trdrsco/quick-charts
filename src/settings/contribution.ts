// What a host adds to the chart settings dialog: a page of its own, or rows inside one of the
// chart's pages. The host builds its rows with the same form the chart builds its own pages with,
// so a contributed row is the chart's row in every measure, and the dialog's Cancel, Ok and
// "Apply defaults" reach the host's settings as they reach the chart's.

/** The chart's own pages, in rail order. */
export type ChartSettingsPageId = 'symbol' | 'statusLine' | 'scales' | 'canvas' | 'events'

/** Paints an icon into a box and answers the disposer that empties it. */
export type ChartSettingsIconPainter = (box: HTMLElement) => () => void

/** One choice of a select. */
export interface ChartSettingsOption<V extends string> {
  value: V
  label: string
}

/** A tip beside a label: a short line on hover, or a card with a title and a body. */
export type ChartSettingsTip =
  | { kind: 'hint'; text: string; href?: string }
  | { kind: 'card'; title: string; body: string; href?: string }

/** A row's handle, for a row whose state another row decides. */
export interface ChartSettingsRowHandle {
  setDisabled(disabled: boolean): void
}

/** The form a page is built with. Every builder appends a row to the page in call order, and the
 *  row's `id` names it for a contribution placed before it. The chart's own rows are named by the
 *  leaf they edit (`background` on the Status line page, for one), and a section the chart shows
 *  only in some contexts by its own name (`indicators` on the Status line page).
 *
 *  A checkbox row that is unchecked disables its own controls and every row indented under it, and
 *  a disabled row stands its checkbox and its label back. */
export interface ChartSettingsForm {
  /** A section heading, written in capitals. Every heading after a page's first stands clear of the
   *  section before it. */
  heading(text: string): void
  /** A checkbox row. `indent` makes it a sub-row of the row above, and `hint` is the grey line
   *  under it. `controls` builds the row's controls after its label. */
  check(row: {
    id: string
    label: string
    checked: boolean
    onChange(checked: boolean): void
    hint?: string
    tip?: ChartSettingsTip
    indent?: boolean
    disabled?: boolean
    controls?(controls: ChartSettingsControls): void
  }): ChartSettingsRowHandle
  /** A labelled row whose label is plain text and whose controls follow it. */
  field(row: { id: string; label: string; tip?: ChartSettingsTip; indent?: boolean; disabled?: boolean; controls(controls: ChartSettingsControls): void }): ChartSettingsRowHandle
}

/** The controls a row holds, laid out after its label in call order. A control is named for a
 *  reader by its row's label unless `label` names it, as each of two colors on one row needs. */
export interface ChartSettingsControls {
  /** A color swatch. `opacity` adds the picker's opacity slider; `lineStyle` and `lineWidth` make
   *  it a color and line swatch whose picker also sets them. A null color follows the bars. */
  color(control: {
    color: string | null
    onColor(color: string): void
    opacity?: boolean
    lineStyle?: { value: 'solid' | 'dashed' | 'dotted'; onChange(style: 'solid' | 'dashed' | 'dotted'): void }
    lineWidth?: { value: number; options: readonly number[]; onChange(width: number): void }
    label?: string
    disabled?: boolean
  }): void
  select<V extends string>(control: { value: V; options: readonly ChartSettingsOption<V>[]; width: number; onChange(value: V): void; label?: string; disabled?: boolean }): void
  /** A select whose list checks any number of its options, and whose button joins the checked
   *  labels or reads `none` when none is checked. The labels after the first are joined in lower
   *  case unless `asWritten`. */
  multiSelect<V extends string>(control: {
    values: readonly V[]
    options: readonly ChartSettingsOption<V>[]
    width: number
    none: string
    onChange(values: readonly V[]): void
    asWritten?: boolean
    label?: string
    disabled?: boolean
  }): void
  /** A number field, 100 pixels wide unless `width` says otherwise, and the unit after it. The value
   *  is reported when the field is left or a stepper is pressed. NaN leaves the field empty. */
  number(control: { value: number; min: number; max: number; step: number; suffix?: string; width?: number; onChange(value: number): void; label?: string; disabled?: boolean }): void
  /** A line's thickness on its own, as a field wearing the thickness, whose list offers `options`. */
  lineWidth(control: { value: number; options: readonly number[]; onChange(width: number): void; label?: string; disabled?: boolean }): void
  /** A level from 0 to 1, as a volume with a speaker before it or as an opacity over its color. A
   *  drag reports every step it passes. */
  slider(control: { value: number; kind: 'volume' | { opacity: string }; onChange(value: number): void; label?: string; disabled?: boolean }): void
  /** Start a second line of controls under the first, in the controls' column. */
  nextLine(): void
}

/** A host's contribution to the settings dialog. */
export interface ChartSettingsContribution {
  /** Either a page of the host's own, placed after a chart page (or last), or rows appended to one
   *  of the chart's pages, before one of its rows (or at its end). `before` may name several rows or
   *  sections: the rows land before the first of them the page holds, so a placement survives a
   *  section the page shows only in some contexts (the Status line page's `indicators`). */
  place:
    | { page: { id: string; label: string; icon: ChartSettingsIconPainter; after?: ChartSettingsPageId } }
    | { into: ChartSettingsPageId; before?: string | readonly string[] }
  /** Build the rows. The dialog calls it whenever the page is drawn, including after every change
   *  a row reports, so it reads the host's current state each time. */
  build(form: ChartSettingsForm): void
  /** The dialog opened: answer the state that Cancel restores. */
  open?(): unknown
  /** The viewer cancelled: restore the state `open` answered. Changes preview as they are made, so
   *  this is the only undo. */
  cancel?(state: unknown): void
  /** The viewer pressed Ok. */
  commit?(): void
  /** The viewer chose "Apply defaults": return every setting this contribution owns to its default. */
  applyDefaults?(): void
}
