// @vitest-environment happy-dom
// The settings pages of the line, shape, curve, leveled and pattern tools, row by row: which pages
// each tool gets, every row's label, the kind of every control in it and the value it opens on, the choices
// each list offers in their order, and the look and setup a new drawing of each tool starts with.
//
// Each page is read as row signatures; settingsRig.ts says how.
import { afterEach, describe, expect, it } from 'vitest'
import { drawingTools } from '../../../src/drawings/index'
import { anchors, choices, rig, signature } from './settingsRig'

afterEach(() => {
  document.body.replaceChildren()
})

const LINE_TEXT = ['full: color select(14) toggle toggle', 'full: textarea', 'Text alignment: select(Top) select(Center)']
const TWO_POINTS = ['#1 (price, bar): number number', '#2 (price, bar): number number']
const lineStyle = (extend: string, stats: string, position: string, always: string): string[] => [
  'Line: colorWithThickness lineEnd lineEnd',
  `Extend: multi(${extend})`,
  '[ ] Middle point',
  '[ ] Price labels',
  '## Info',
  `Stats: multi(${stats})`,
  `Stats position: select(${position})`,
  `${always} Always show stats`,
  'gap',
]

/** A fib's level grid, two levels to a line, from whether each level is shown, then the room the
 *  grid keeps after it. */
const levelGrid = (shown: boolean[]): string[] => {
  const cell = (on: boolean): string => `check(${on ? 'x' : ' '}) number color`
  const lines: string[] = []
  for (let i = 0; i < shown.length; i += 2) lines.push(`full: ${[shown[i]!, shown[i + 1]].filter((v) => v !== undefined).map((v) => cell(!!v)).join(' ')}`)
  return [...lines, 'gap']
}

/** The twenty-four levels of a retracement, an extension and a fib channel: eleven shown. */
const FIB_SHOWN = Array.from({ length: 24 }, (_, i) => i < 11)
const THREE_POINTS = [...TWO_POINTS, '#3 (price, bar): number number']

const fibStyle = (retracement: boolean): string[] => [
  ...(retracement ? ['[x] Trend line: colorWithThickness'] : []),
  'Levels line: mark(thickness) mark(style)',
  "Extend: multi(Don't extend)",
  ...levelGrid(FIB_SHOWN),
  'Use one color: color',
  '[x] Background: opacity',
  ...(retracement ? ['[ ] Reverse'] : []),
  '[x] Prices',
  '[x] Levels: select(Values)',
  'Labels: select(Left) select(Middle)',
  ...(retracement ? ['[x] Text: select(Center) select(Middle)'] : []),
  'Font size: select(12)',
  ...(retracement ? ['[ ] Fib levels based on log scale'] : []),
]

/** A fib's levels one to a line, each in a stroke of its own, from whether each level is shown. */
const levelLines = (shown: boolean[]): string[] => shown.map((on) => `full: check(${on ? 'x' : ' '}) number colorWithThickness`)
const all = (n: number): boolean[] => Array.from({ length: n }, () => true)
const TREND = '[x] Trend line: colorWithThickness'
const BANDS = (on: boolean): string => `${on ? '[x]' : '[ ]'} Background: opacity`

/** A box's seven divisions on one side, two to a line. */
const BOX_GRID = [...Array.from({ length: 3 }, () => 'full: check(x) number color check(x) number color'), 'full: check(x) number color']

/** A pitchfork's Style page: its lines' extension, its median, its nine pairs with the half and the
 *  tines shown, the one color, the bands, and its construction named in its Style list. */
const forkStyle = (construction: string): string[] => [
  '[ ] Extend lines',
  'Median: colorWithThickness',
  ...levelLines([false, false, true, false, false, true, false, false, false]),
  'Use one color: color',
  BANDS(true),
  `Style: select(${construction})`,
]

/** A gann square's set of lines under its section, two to a line, each its switch with its place or
 *  its ratio and its stroke, from which of them are shown, then the room the set keeps after it. */
const squareGrid = (title: string, cells: [string, boolean][]): string[] => {
  const cell = ([words, on]: [string, boolean]): string => `${on ? '[x]' : '[ ]'} ${words} colorWithThickness`
  const lines = [`## ${title}`]
  for (let i = 0; i < cells.length; i += 2) lines.push(`full: ${cells.slice(i, i + 2).map(cell).join(' ')}`)
  return [...lines, 'gap']
}
const shownCell = (words: string): [string, boolean] => [words, true]

/** A gann square's Style page: its grid, its fans with 2x1, 1x1 and 1x2 shown, its arcs, the one
 *  color, the bands and Reverse. */
const SQUARE_STYLE = [
  ...squareGrid('Levels', ['0', '1', '2', '3', '4', '5'].map(shownCell)),
  ...squareGrid('Fans', ['8x1', '5x1', '4x1', '3x1', '2x1', '1x1', '1x2', '1x3', '1x4', '1x5', '1x8'].map((w): [string, boolean] => [w, ['2x1', '1x1', '1x2'].includes(w)])),
  ...squareGrid('Arcs', ['1x0', '1x1', '1.5x0', '2x0', '2x1', '3x0', '3x1', '4x0', '4x1', '5x0', '5x1'].map(shownCell)),
  'Use one color: color',
  BANDS(true),
  '[ ] Reverse',
]

/** The Coordinates page of a tool placed on so many points. */
const points = (n: number): string[] => Array.from({ length: n }, (_, i) => `#${i + 1} (price, bar): number number`)

/** A pattern's Style page: its letters, its border and, where it shades its legs, its background. */
const patternStyle = (shaded: boolean): string[] => ['Label: color select(12) toggle toggle', 'Border: colorWithThickness', ...(shaded ? ['[x] Background: color'] : [])]

/** A wave count's Style page: its color, its wave's switch and thickness, and its degree. */
const WAVE_STYLE = ['Color: color', '[x] Wave: mark(thickness)', 'Degree: select(Intermediate)']

/** Every tool of the line, shape, curve, leveled and pattern families: its pages, and the rows of
 *  each page. */
/** A position's Inputs page: its account, lots, risk and leverage, its entry, its target and stop as
 *  ticks and a price, and how its quantity is written. */
const POSITION_INPUTS = [
  'Account size: number',
  'Lot size: number',
  'Risk: number select(%)',
  'Entry price: number',
  'Leverage: number',
  'gap',
  '## Profit level',
  'Ticks: number',
  'Price: number',
  'gap',
  '## Stop level',
  'Ticks: number',
  'Price: number',
  'gap',
  'QTY precision: select(Default)',
  'gap',
]

/** A position's Style page, all the stats but the two levels' P&L shown. */
const POSITION_STYLE = [
  'Lines: colorWithThickness',
  'Stop color: color',
  'Target color: color',
  'Text: color select(12)',
  '[x] Price labels',
  '## Info',
  'Stats: multi(TP price offset, TP percent offset, TP tick offset, TP amount, Open/closed PL, Qty, Risk/reward ratio, SL price offset, SL percent offset, SL tick offset, SL amount)',
  '[ ] Compact stats mode',
  '[ ] Always show stats',
  'gap',
]

/** A volume profile's Inputs page; a fixed range runs on with new bars on its own switch. */
const profileInputs = (fixed: boolean): string[] => ['Rows Layout: select(Number Of Rows)', 'Row Size: number', 'Volume: select(Up/Down)', 'Value Area Volume: number', ...(fixed ? ['[x] Extend Right'] : [])]

/** A volume profile's Style page; an anchored one grows from the right and reads its lines on the
 *  price scale. */
const profileStyle = (anchored: boolean): string[] => [
  '[x] Volume profile',
  '[ ] Values: color',
  'Width (% of the box): number',
  `Placement: select(${anchored ? 'Right' : 'Left'})`,
  'Up Volume: color',
  'Down Volume: color',
  'Value Area Up: color',
  'Value Area Down: color',
  '[ ] VAH: colorWithThickness',
  '[ ] VAL: colorWithThickness',
  '[x] POC: colorWithThickness',
  '[ ] Developing POC: colorWithThickness',
  '[ ] Developing VA: colorWithThickness',
  'Histogram Box: color',
  ...(anchored ? ['[x] Labels on price scale'] : []),
]

/** A range meter's Style page, from what it carries before its stats and what its stats read. */
const meterStyle = (before: string[], stats: string): string[] => ['Line: colorWithThickness', ...before, '## Info', `Stats: multi(${stats})`, 'Label: color select(12)', '[x] Label background: color', 'gap']
const METER_TEXT = ['full: color select(12) toggle toggle', 'full: textarea']

/** A channel's Text page: its words' color, size, weight and slant, its words, and where they stand. */
const CHANNEL_TEXT = ['full: color select(14) toggle toggle', 'full: textarea', 'Text alignment: select(Top) select(Left)']

/** A flat top/bottom's and a disjoint channel's Style page. */
const CHANNEL_STYLE = ['Line: colorWithThickness lineEnd lineEnd', "Extend: multi(Don't extend)", '[ ] Prices: color select(12) toggle toggle', '[x] Background: color']

const PAGES: Record<string, { tabs: string[]; Style: string[]; Inputs?: string[]; Text?: string[]; Coordinates?: string[] }> = {
  trend_line: { tabs: ['Style', 'Text', 'Coordinates', 'Visibility'], Style: lineStyle("Don't extend", 'Hidden', 'Right', '[ ]'), Text: LINE_TEXT, Coordinates: TWO_POINTS },
  ray: { tabs: ['Style', 'Text', 'Coordinates', 'Visibility'], Style: lineStyle('Extend right line', 'Hidden', 'Right', '[ ]'), Text: LINE_TEXT, Coordinates: TWO_POINTS },
  info_line: {
    tabs: ['Style', 'Text', 'Coordinates', 'Visibility'],
    Style: lineStyle("Don't extend", 'Price range, percent change, change in pips, bars range, date/time range, angle', 'Center', '[x]'),
    Text: LINE_TEXT,
    Coordinates: TWO_POINTS,
  },
  extended: { tabs: ['Style', 'Text', 'Coordinates', 'Visibility'], Style: lineStyle('Extend left line, extend right line', 'Hidden', 'Right', '[ ]'), Text: LINE_TEXT, Coordinates: TWO_POINTS },
  arrow: { tabs: ['Style', 'Text', 'Coordinates', 'Visibility'], Style: lineStyle("Don't extend", 'Hidden', 'Right', '[ ]'), Text: LINE_TEXT, Coordinates: TWO_POINTS },
  trend_angle: {
    tabs: ['Style', 'Coordinates', 'Visibility'],
    Style: ['Line: colorWithThickness', ...lineStyle("Don't extend", 'Hidden', 'Right', '[ ]').slice(1)],
    Coordinates: ['#1 (price, bar): number number', 'Angle: number'],
  },
  horizontal_line: {
    tabs: ['Style', 'Text', 'Coordinates', 'Visibility'],
    Style: ['Line: colorWithThickness', '[x] Price label'],
    Text: ['full: color select(12) toggle toggle', 'full: textarea', 'Text alignment: select(Middle) select(Center)'],
    Coordinates: ['#1 (price): number'],
  },
  horizontal_ray: {
    tabs: ['Style', 'Text', 'Coordinates', 'Visibility'],
    Style: ['Line: colorWithThickness', '[x] Price label'],
    Text: ['full: color select(12) toggle toggle', 'full: textarea', 'Text alignment: select(Bottom) select(Center)'],
    Coordinates: ['#1 (price, bar): number number'],
  },
  vertical_line: {
    tabs: ['Style', 'Text', 'Coordinates', 'Visibility'],
    Style: ['Line: colorWithThickness', '[x] Time label'],
    Text: ['full: color select(14) toggle toggle', 'full: textarea', 'Text alignment: select(Middle) select(Center)', 'Text orientation: select(Vertical)'],
    Coordinates: ['#1 (bar): number'],
  },
  cross_line: {
    tabs: ['Style', 'Coordinates', 'Visibility'],
    Style: ['Line: colorWithThickness', '[x] Price label', '[x] Time label'],
    Coordinates: ['#1 (price, bar): number number'],
  },
  rectangle: {
    tabs: ['Style', 'Text', 'Coordinates', 'Visibility'],
    Style: ["Extend: multi(Don't extend)", 'Border: colorWithThickness', '[ ] Middle line: colorWithThickness', '[x] Background: color'],
    Text: ['full: color select(14) toggle toggle', 'full: textarea', 'Text alignment: select(Inside) select(Center)'],
    Coordinates: TWO_POINTS,
  },
  rotated_rectangle: { tabs: ['Style', 'Visibility'], Style: ['Border: colorWithThickness', '[x] Background: color'] },
  arc: { tabs: ['Style', 'Visibility'], Style: ['Border: colorWithThickness', '[x] Background: color'] },
  polyline: { tabs: ['Style', 'Visibility'], Style: ['Border: colorWithThickness', '[x] Background: color'] },
  triangle: {
    tabs: ['Style', 'Coordinates', 'Visibility'],
    Style: ['Border: colorWithThickness', '[x] Background: color'],
    Coordinates: [...TWO_POINTS, '#3 (price, bar): number number'],
  },
  ellipse: { tabs: ['Style', 'Text', 'Visibility'], Style: ['Border: colorWithThickness', '[x] Background: color'], Text: ['full: color select(14) toggle toggle', 'full: textarea'] },
  circle: {
    tabs: ['Style', 'Text', 'Coordinates', 'Visibility'],
    Style: ['Border: colorWithThickness', '[x] Background: color'],
    Text: ['full: color select(14) toggle toggle', 'full: textarea'],
    Coordinates: TWO_POINTS,
  },
  curve: {
    tabs: ['Style', 'Coordinates', 'Visibility'],
    Style: ['Line: colorWithThickness lineEnd lineEnd', "Extend: multi(Don't extend)", '[ ] Background: color'],
    Coordinates: [...TWO_POINTS, '#3 (price, bar): number number'],
  },
  double_curve: {
    tabs: ['Style', 'Coordinates', 'Visibility'],
    Style: ['Line: colorWithThickness lineEnd lineEnd', "Extend: multi(Don't extend)", '[ ] Background: color'],
    Coordinates: [...TWO_POINTS, '#3 (price, bar): number number', '#4 (price, bar): number number'],
  },
  fib_retracement: { tabs: ['Style', 'Coordinates', 'Visibility'], Style: fibStyle(true), Coordinates: TWO_POINTS },
  fib_trend_ext: { tabs: ['Style', 'Coordinates', 'Visibility'], Style: fibStyle(true), Coordinates: THREE_POINTS },
  fib_channel: { tabs: ['Style', 'Coordinates', 'Visibility'], Style: fibStyle(false), Coordinates: THREE_POINTS },
  fib_timezone: {
    tabs: ['Style', 'Coordinates', 'Visibility'],
    Style: [...levelLines(all(11)), 'Use one color: color', BANDS(false), '[x] Labels: select(Right) select(Bottom)'],
    Coordinates: TWO_POINTS,
  },
  fib_trend_time: {
    tabs: ['Style', 'Coordinates', 'Visibility'],
    Style: [TREND, ...levelLines([true, true, false, ...all(8)]), 'Use one color: color', BANDS(true), '[x] Labels: select(Right) select(Bottom)'],
    Coordinates: THREE_POINTS,
  },
  fib_circles: {
    tabs: ['Style', 'Coordinates', 'Visibility'],
    Style: [TREND, ...levelLines(all(11)), 'Use one color: color', BANDS(true), '[x] Levels', '[ ] Coeffs as percents'],
    Coordinates: TWO_POINTS,
  },
  fib_speed_resist_arcs: {
    tabs: ['Style', 'Coordinates', 'Visibility'],
    Style: [TREND, ...levelLines(all(11)), 'Use one color: color', BANDS(true), '[x] Levels', '[ ] Full circles'],
    Coordinates: TWO_POINTS,
  },
  fib_wedge: { tabs: ['Style', 'Visibility'], Style: [TREND, ...levelLines([...all(6), false, false, false, false, false]), 'Use one color: color', BANDS(true), '[x] Levels'] },
  pitchfan: {
    tabs: ['Style', 'Coordinates', 'Visibility'],
    Style: ['Median: colorWithThickness', ...levelLines([false, false, true, false, false, true, false, false, false]), 'Use one color: color', BANDS(true)],
    Coordinates: THREE_POINTS,
  },
  fib_speed_resist_fan: {
    tabs: ['Style', 'Coordinates', 'Visibility'],
    Style: ['## Price levels', ...BOX_GRID, '[x] Left labels', '[x] Right labels', 'gap', '## Time levels', ...BOX_GRID, '[x] Top labels', '[x] Bottom labels', 'gap', 'Use one color: color', BANDS(true), '[x] Grid: colorWithThickness', '[ ] Reverse'],
    Coordinates: TWO_POINTS,
  },
  gannbox: {
    tabs: ['Style', 'Coordinates', 'Visibility'],
    Style: ['## Price levels', ...BOX_GRID, '[x] Left labels', '[x] Right labels', BANDS(true), 'gap', '## Time levels', ...BOX_GRID, '[x] Top labels', '[x] Bottom labels', BANDS(true), 'gap', 'Use one color: color', '[ ] Angles: color', '[ ] Reverse'],
    Coordinates: TWO_POINTS,
  },
  fib_spiral: { tabs: ['Style', 'Coordinates', 'Visibility'], Style: ['Line: colorWithThickness', '[ ] Counterclockwise'], Coordinates: TWO_POINTS },
  pitchfork: { tabs: ['Style', 'Coordinates', 'Visibility'], Style: forkStyle('Original'), Coordinates: THREE_POINTS },
  schiff_pitchfork: { tabs: ['Style', 'Coordinates', 'Visibility'], Style: forkStyle('Schiff'), Coordinates: THREE_POINTS },
  schiff_pitchfork_modified: { tabs: ['Style', 'Coordinates', 'Visibility'], Style: forkStyle('Modified Schiff'), Coordinates: THREE_POINTS },
  inside_pitchfork: { tabs: ['Style', 'Coordinates', 'Visibility'], Style: forkStyle('Inside'), Coordinates: THREE_POINTS },
  gannbox_square: {
    tabs: ['Style', 'Coordinates', 'Visibility'],
    Style: [...SQUARE_STYLE, 'Price/bar ratio: number', '[x] Ranges and ratio: select(12) toggle toggle'],
    Coordinates: TWO_POINTS,
  },
  gannbox_fixed: { tabs: ['Style', 'Coordinates', 'Visibility'], Style: SQUARE_STYLE, Coordinates: TWO_POINTS },
  gannbox_fan: {
    tabs: ['Style', 'Coordinates', 'Visibility'],
    Style: [...['1/8', '1/4', '1/3', '1/2', '1/1', '2/1', '3/1', '4/1', '8/1'].map((w) => `full: [x] ${w} colorWithThickness`), 'Use one color: color', BANDS(true), '[x] Labels'],
    Coordinates: TWO_POINTS,
  },
  regression_trend: {
    tabs: ['Inputs', 'Style', 'Coordinates', 'Visibility'],
    Inputs: ['Upper Deviation: number', 'Lower Deviation: number', '[x] Use Upper Deviation', '[x] Use Lower Deviation', 'Source: select(Close)'],
    Style: ['[x] Base: colorWithThickness', '[x] Up: colorWithThickness', '[x] Down: colorWithThickness', '[ ] Extend lines', "[x] Pearson's R"],
    Coordinates: ['#1 (bar): number', '#2 (bar): number'],
  },
  parallel_channel: {
    tabs: ['Style', 'Text', 'Coordinates', 'Visibility'],
    Style: [...levelLines([false, true, false, true, false, true, false]), "Extend: multi(Don't extend)", '[x] Background: color'],
    Text: CHANNEL_TEXT,
    Coordinates: [...TWO_POINTS, 'Price offset: number'],
  },
  flat_top_bottom: { tabs: ['Style', 'Text', 'Visibility'], Style: CHANNEL_STYLE, Text: CHANNEL_TEXT },
  disjoint_channel: { tabs: ['Style', 'Text', 'Visibility'], Style: CHANNEL_STYLE, Text: CHANNEL_TEXT },
  long_position: { tabs: ['Inputs', 'Style', 'Visibility'], Inputs: POSITION_INPUTS, Style: POSITION_STYLE },
  short_position: { tabs: ['Inputs', 'Style', 'Visibility'], Inputs: POSITION_INPUTS, Style: POSITION_STYLE },
  forecast: {
    tabs: ['Style', 'Coordinates', 'Visibility'],
    Style: [
      'Line: colorWithThickness',
      ...['Source text', 'Source background', 'Source border', 'Target text', 'Target background', 'Target border', 'Success text', 'Success background', 'Failure text', 'Failure background'].map((l) => `${l}: color`),
    ],
    Coordinates: TWO_POINTS,
  },
  sector: { tabs: ['Style', 'Visibility'], Style: ['Background: color color', 'Border: colorWithThickness'] },
  bars_pattern: { tabs: ['Style', 'Visibility'], Style: ['Color: color', 'Mode: select(HL bars)', '[ ] Mirrored', '[ ] Flipped'] },
  ghost_feed: {
    tabs: ['Inputs', 'Style', 'Coordinates', 'Visibility'],
    Inputs: ['Avg HL in minticks: number', 'Variance: number'],
    Style: ['Candles: color color', '[x] Borders: color color', '[x] Wick: color', 'Transparency: opacity'],
    Coordinates: TWO_POINTS,
  },
  anchored_vwap: {
    tabs: ['Inputs', 'Style', 'Visibility'],
    Inputs: ['## Bands Settings', 'Bands Calculation Mode: select(Standard Deviation)', 'full: [x] Bands Multiplier #1 number', 'full: [ ] Bands Multiplier #2 number', 'full: [ ] Bands Multiplier #3 number', 'gap', 'Source: select((H + L + C)/3)'],
    Style: [
      'VWAP: colorWithThickness',
      '[x] Lower band #1: colorWithThickness',
      '[x] Upper band #1: colorWithThickness',
      '[x] Background #1: color',
      '[x] Lower band #2: colorWithThickness',
      '[x] Upper band #2: colorWithThickness',
      '[x] Lower band #3: colorWithThickness',
      '[x] Upper band #3: colorWithThickness',
      '[ ] Price label',
    ],
  },
  fixed_range_volume_profile: {
    tabs: ['Inputs', 'Style', 'Coordinates', 'Visibility'],
    Inputs: profileInputs(true),
    Style: profileStyle(false),
    Coordinates: ['#1 (bar): number', '#2 (bar): number'],
  },
  anchored_volume_profile: {
    tabs: ['Inputs', 'Style', 'Coordinates', 'Visibility'],
    Inputs: profileInputs(false),
    Style: profileStyle(true),
    Coordinates: ['#1 (bar): number'],
  },
  price_range: {
    tabs: ['Style', 'Text', 'Coordinates', 'Visibility'],
    Style: meterStyle(['[x] Background: color', "Extend: multi(Don't extend)"], 'Price range, percent change, change in pips'),
    Text: METER_TEXT,
    Coordinates: TWO_POINTS,
  },
  date_range: {
    tabs: ['Style', 'Text', 'Coordinates', 'Visibility'],
    Style: meterStyle(['[x] Background: color', "Extend: multi(Don't extend)"], 'Bars range, date/time range, volume'),
    Text: METER_TEXT,
    Coordinates: TWO_POINTS,
  },
  date_and_price_range: {
    tabs: ['Style', 'Text', 'Coordinates', 'Visibility'],
    Style: meterStyle(['[ ] Border: colorWithThickness', '[x] Background: color'], 'Price range, percent change, change in pips, bars range, date/time range, volume'),
    Text: METER_TEXT,
    Coordinates: TWO_POINTS,
  },
  xabcd_pattern: { tabs: ['Style', 'Coordinates', 'Visibility'], Style: patternStyle(true), Coordinates: points(5) },
  cypher_pattern: { tabs: ['Style', 'Coordinates', 'Visibility'], Style: patternStyle(true), Coordinates: points(5) },
  abcd_pattern: { tabs: ['Style', 'Coordinates', 'Visibility'], Style: patternStyle(false), Coordinates: points(4) },
  three_drives: { tabs: ['Style', 'Coordinates', 'Visibility'], Style: patternStyle(false), Coordinates: points(7) },
  triangle_pattern: { tabs: ['Style', 'Coordinates', 'Visibility'], Style: patternStyle(true), Coordinates: points(4) },
  head_and_shoulders: { tabs: ['Style', 'Coordinates', 'Visibility'], Style: patternStyle(true), Coordinates: points(7) },
  elliott_impulse_wave: { tabs: ['Style', 'Coordinates', 'Visibility'], Style: WAVE_STYLE, Coordinates: points(6) },
  elliott_correction: { tabs: ['Style', 'Coordinates', 'Visibility'], Style: WAVE_STYLE, Coordinates: points(4) },
  elliott_triangle_wave: { tabs: ['Style', 'Coordinates', 'Visibility'], Style: WAVE_STYLE, Coordinates: points(6) },
  elliott_double_combo: { tabs: ['Style', 'Coordinates', 'Visibility'], Style: WAVE_STYLE, Coordinates: points(4) },
  elliott_triple_combo: { tabs: ['Style', 'Coordinates', 'Visibility'], Style: WAVE_STYLE, Coordinates: points(6) },
  cyclic_lines: { tabs: ['Style', 'Coordinates', 'Visibility'], Style: ['Lines: colorWithThickness'], Coordinates: TWO_POINTS },
  sine_line: { tabs: ['Style', 'Coordinates', 'Visibility'], Style: ['Lines: colorWithThickness'], Coordinates: TWO_POINTS },
  time_cycles: { tabs: ['Style', 'Coordinates', 'Visibility'], Style: ['Line: colorWithThickness', '[x] Background: color'], Coordinates: TWO_POINTS },
}

describe('the pages and rows of the line, shape, curve, leveled and pattern tools', () => {
  for (const [type, expected] of Object.entries(PAGES)) {
    it(type, () => {
      const { tabs, show, page } = rig(type)
      expect(tabs()).toEqual(expected.tabs)
      expect(signature(page())).toEqual(expected.Style)
      for (const tab of ['Inputs', 'Text', 'Coordinates'] as const) {
        if (!expected[tab]) continue
        show(tab)
        expect(signature(page()), `${type} ${tab}`).toEqual(expected[tab])
      }
    })
  }

  it('lists the Visibility page as a checkbox row for ticks and a range row per timeframe', () => {
    const { show, page } = rig('trend_line')
    show('Visibility')
    expect(signature(page())).toEqual([
      '[x] Ticks',
      '[x] Seconds: number range number',
      '[x] Minutes: number range number',
      '[x] Hours: number range number',
      '[x] Days: number range number',
      '[x] Weeks: number range number',
      '[x] Months: number range number',
    ])
  })
})

describe('the choices each list offers, in order', () => {
  it('a line: its ends, its extensions, its stats and where they stand', () => {
    const { dialog, page } = rig('trend_line')
    const [color, left] = [...page().querySelectorAll<HTMLElement>('.qc-drawing-row-controls')[0]!.children] as HTMLElement[]
    expect(color!.getAttribute('aria-label')).toBe('Line')
    expect(choices(dialog, left!)).toEqual(['Normal', 'Arrow'])
    const lists = [...page().querySelectorAll<HTMLElement>('.qc-drawing-select')]
    expect(choices(dialog, lists[0]!)).toEqual(['Extend left line', 'Extend right line'])
    expect(choices(dialog, lists[1]!)).toEqual(['Price range', 'Percent change', 'Change in pips', 'Bars range', 'Date/time range', 'Angle'])
    expect(choices(dialog, lists[2]!)).toEqual(['Left', 'Center', 'Right', 'Auto'])
  })

  it('a trend angle: the stats that read on its own line', () => {
    const { dialog, page } = rig('trend_angle')
    const lists = [...page().querySelectorAll<HTMLElement>('.qc-drawing-select')]
    expect(choices(dialog, lists[1]!)).toEqual(['Price range', 'Percent change', 'Change in pips', 'Bars range'])
  })

  it('the Text page: the sizes, where the words stand and which way they read', () => {
    const line = rig('vertical_line')
    line.show('Text')
    const [size, across, along, orientation] = [...line.page().querySelectorAll<HTMLElement>('.qc-drawing-select')]
    expect(choices(line.dialog, size!)).toEqual(['8', '10', '11', '12', '14', '16', '18', '20', '22', '24', '28', '32', '40'])
    expect(choices(line.dialog, across!)).toEqual(['Top', 'Middle', 'Bottom'])
    expect(choices(line.dialog, along!)).toEqual(['Left', 'Center', 'Right'])
    expect(choices(line.dialog, orientation!)).toEqual(['Horizontal', 'Vertical'])
    const box = rig('rectangle')
    box.show('Text')
    expect(choices(box.dialog, box.page().querySelectorAll<HTMLElement>('.qc-drawing-select')[1]!)).toEqual(['Top', 'Inside', 'Bottom'])
    box.show('Style')
    expect(choices(box.dialog, box.page().querySelector<HTMLElement>('.qc-drawing-select')!)).toEqual(['Extend left', 'Extend right'])
  })
})

describe('what the rows write', () => {
  it('ticks extensions and stats quietly, keeping the list open', () => {
    const { dialog, drawing, page } = rig('trend_line')
    const stats = page().querySelectorAll<HTMLElement>('.qc-drawing-select')[1]!
    stats.click()
    const items = [...dialog.parentElement!.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')]
    items[2]!.click()
    items[5]!.click()
    expect(drawing.props.showPipsChange).toBe(true)
    expect(drawing.props.showAngle).toBe(true)
    expect(stats.textContent).toBe('Change in pips, angle')
    expect(dialog.parentElement!.querySelector('[role="menu"]')).not.toBeNull()
  })

  it('switches a background and a middle line on and off, keeping their colors', () => {
    const { drawing, page } = rig('rectangle')
    // The page rebuilds after each switch, so each one is read from the page as it stands.
    const checked = (): HTMLElement[] => [...page().querySelectorAll<HTMLElement>('.qc-drawing-row--checked')]
    checked()[1]!.querySelector('input')!.click()
    expect(drawing.props.fillBackground).toBe(false)
    expect(drawing.style.fillOpacity).toBe(0.2)
    expect(checked()[1]!.querySelector('input')!.checked).toBe(false)
    checked()[0]!.querySelector('input')!.click()
    expect(drawing.props.middleLine).toBe(true)
    expect(drawing.props.middleLineColor).toBe('#9c27b0')
  })

  it('holds the weight and slant as pressed toggles of the field box', () => {
    const { drawing, show, page } = rig('trend_line')
    show('Text')
    const [bold, italic] = [...page().querySelectorAll<HTMLButtonElement>('.qc-drawing-font-toggle')]
    expect(bold!.getAttribute('aria-pressed')).toBe('false')
    bold!.click()
    expect(drawing.style.bold).toBe(true)
    expect(page().querySelector('.qc-drawing-font-toggle')!.getAttribute('aria-pressed')).toBe('true')
    expect(italic!.getAttribute('aria-label')).toBe('Italic')
    expect(page().querySelector('.qc-drawing-font-toggle svg')).not.toBeNull()
  })
})

/** The look and setup each tool opens with: the factory look of its kind. */
describe('what a new drawing of each tool starts with', () => {
  const look = (type: string) => {
    const d = drawingTools.create(type, 'x', anchors(drawingTools.get(type)!.anchors))!
    return { line: d.style.lineColor, width: d.style.lineWidth, fill: d.style.fillOpacity > 0 ? `${d.style.fillColor} ${d.style.fillOpacity}` : null, text: d.style.textColor, size: d.style.fontSize, props: d.props }
  }

  it('draws a line tool in one blue at 2px, its words at 14px', () => {
    for (const type of ['trend_line', 'ray', 'info_line', 'extended', 'arrow', 'vertical_line', 'cross_line']) {
      const l = look(type)
      expect([l.line, l.width, l.text, l.size], type).toEqual(['#2962ff', 2, '#2962ff', 14])
    }
    for (const type of ['trend_angle', 'horizontal_line', 'horizontal_ray']) expect(look(type).size, type).toBe(12)
    expect(look('ray').props).toMatchObject({ extendLeft: false, extendRight: true })
    expect(look('arrow').props).toMatchObject({ leftEnd: 'normal', rightEnd: 'arrow' })
    expect(look('info_line').props).toMatchObject({ alwaysShowStats: true, statsPosition: 'center', showPipsChange: true, showDateTimeRange: true })
    expect(look('trend_line').props).toMatchObject({ statsPosition: 'right', alwaysShowStats: false, textVAlign: 'top', textHAlign: 'center' })
    expect(look('vertical_line').props).toMatchObject({ textOrientation: 'vertical', textVAlign: 'middle', showTime: true })
  })

  it('draws the cycles in their own hues at 2px, a time cycle’s humps shaded at half', () => {
    expect([look('cyclic_lines').line, look('cyclic_lines').width]).toEqual(['#80ccdb', 2])
    expect([look('sine_line').line, look('sine_line').width]).toEqual(['#159980', 2])
    const cycles = look('time_cycles')
    expect([cycles.line, cycles.width, cycles.fill]).toEqual(['#159980', 2, '#6aa84f 0.5'])
    expect(cycles.props).toEqual({ fillBackground: true })
  })

  it('draws a shape in its own hue with a background at a fifth, a curve with its background off', () => {
    const hues: Record<string, string> = {
      rectangle: '#9c27b0',
      rotated_rectangle: '#4caf50',
      ellipse: '#f23645',
      circle: '#ff9800',
      triangle: '#089981',
      arc: '#e91e63',
      polyline: '#00bcd4',
      curve: '#2962ff',
      double_curve: '#673ab7',
    }
    for (const [type, hue] of Object.entries(hues)) {
      const l = look(type)
      expect([l.line, l.width, l.fill], type).toEqual([hue, 2, `${hue} 0.2`])
      expect(l.props.fillBackground, type).toBe(type !== 'curve' && type !== 'double_curve')
    }
    expect(look('rectangle').props).toMatchObject({ middleLine: false, middleLineWidth: 1, middleLineStyle: 'dashed', textVAlign: 'middle' })
  })
})
