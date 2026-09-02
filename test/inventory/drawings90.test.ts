// The 90 drawing registrations as explicit release inventory (public-chart-library-boundary-plan.md
// PCL-1, PCL-5 extraction ledger, acceptance gate "all 90 drawings and 55 layouts are
// inventory-pinned"). The registry is read at runtime; the list here is the pin. A tool added,
// renamed, or moved between categories changes this file on purpose, in the same commit, and the
// diff is the release note.
import { TOOL_CATEGORIES, drawingTools } from 'quickcharts/drawings'
import { describe, expect, it } from 'vitest'

/** Every registered tool type with its category, sorted by type. */
const TOOLS: readonly (readonly [type: string, category: string])[] = [
  ['abcd_pattern', 'patterns'],
  ['anchored_volume_profile', 'volume'],
  ['anchored_vwap', 'volume'],
  ['arc', 'shapes'],
  ['arrow', 'lines'],
  ['arrow_down', 'annotation'],
  ['arrow_marker', 'annotation'],
  ['arrow_up', 'annotation'],
  ['bars_pattern', 'forecasting'],
  ['brush', 'shapes'],
  ['callout', 'annotation'],
  ['circle', 'shapes'],
  ['comment', 'annotation'],
  ['content_card', 'content'],
  ['cross_line', 'lines'],
  ['curve', 'shapes'],
  ['cyclic_lines', 'cycles'],
  ['cypher_pattern', 'patterns'],
  ['date_and_price_range', 'measurement'],
  ['date_range', 'measurement'],
  ['disjoint_channel', 'channels'],
  ['double_curve', 'shapes'],
  ['elliott_correction', 'elliott'],
  ['elliott_double_combo', 'elliott'],
  ['elliott_impulse_wave', 'elliott'],
  ['elliott_triangle_wave', 'elliott'],
  ['elliott_triple_combo', 'elliott'],
  ['ellipse', 'shapes'],
  ['emoji', 'content'],
  ['extended', 'lines'],
  ['fib_channel', 'fibonacci'],
  ['fib_circles', 'fibonacci'],
  ['fib_retracement', 'fibonacci'],
  ['fib_speed_resist_arcs', 'fibonacci'],
  ['fib_speed_resist_fan', 'fibonacci'],
  ['fib_spiral', 'fibonacci'],
  ['fib_timezone', 'fibonacci'],
  ['fib_trend_ext', 'fibonacci'],
  ['fib_trend_time', 'fibonacci'],
  ['fib_wedge', 'fibonacci'],
  ['fixed_range_volume_profile', 'volume'],
  ['flag', 'annotation'],
  ['flat_top_bottom', 'channels'],
  ['forecast', 'forecasting'],
  ['gannbox', 'gann'],
  ['gannbox_fan', 'gann'],
  ['gannbox_fixed', 'gann'],
  ['gannbox_square', 'gann'],
  ['ghost_feed', 'forecasting'],
  ['head_and_shoulders', 'patterns'],
  ['highlighter', 'shapes'],
  ['horizontal_line', 'lines'],
  ['horizontal_ray', 'lines'],
  ['icon', 'content'],
  ['image', 'content'],
  ['info_line', 'lines'],
  ['inside_pitchfork', 'pitchforks'],
  ['long_position', 'forecasting'],
  ['measure', 'measurement'],
  ['note', 'annotation'],
  ['parallel_channel', 'channels'],
  ['path', 'shapes'],
  ['pin', 'annotation'],
  ['pitchfan', 'fibonacci'],
  ['pitchfork', 'pitchforks'],
  ['polyline', 'shapes'],
  ['price_label', 'annotation'],
  ['price_note', 'annotation'],
  ['price_range', 'measurement'],
  ['ray', 'lines'],
  ['rectangle', 'shapes'],
  ['regression_trend', 'channels'],
  ['rotated_rectangle', 'shapes'],
  ['schiff_pitchfork', 'pitchforks'],
  ['schiff_pitchfork_modified', 'pitchforks'],
  ['sector', 'forecasting'],
  ['short_position', 'forecasting'],
  ['signpost', 'annotation'],
  ['sine_line', 'cycles'],
  ['sticker', 'content'],
  ['table', 'annotation'],
  ['text', 'annotation'],
  ['three_drives', 'patterns'],
  ['time_cycles', 'cycles'],
  ['trend_angle', 'lines'],
  ['trend_line', 'lines'],
  ['triangle', 'shapes'],
  ['triangle_pattern', 'patterns'],
  ['vertical_line', 'lines'],
  ['xabcd_pattern', 'patterns'],
]

/** The 14 categories in the toolbar rail's display order, each with its tool count. */
const CATEGORIES: readonly (readonly [category: string, count: number])[] = [
  ['lines', 10],
  ['channels', 4],
  ['pitchforks', 4],
  ['fibonacci', 11],
  ['gann', 4],
  ['patterns', 6],
  ['elliott', 5],
  ['cycles', 3],
  ['forecasting', 6],
  ['volume', 3],
  ['measurement', 4],
  ['shapes', 12],
  ['annotation', 13],
  ['content', 5],
]

describe('the 90 drawing registrations', () => {
  it('pins every registered tool type and its category, sorted', () => {
    const registered = drawingTools
      .all()
      .map((t) => [t.type, t.category] as const)
      .sort((a, b) => a[0].localeCompare(b[0]))
    expect(registered).toEqual(TOOLS)
    expect(TOOLS.length).toBe(90)
  })

  it('pins the 14 categories in rail order, and the count under each', () => {
    expect([...TOOL_CATEGORIES]).toEqual(CATEGORIES.map(([c]) => c))
    for (const [category, count] of CATEGORIES) expect(drawingTools.byCategory(category as never).length, category).toBe(count)
    expect(CATEGORIES.reduce((n, [, c]) => n + c, 0)).toBe(90)
  })

  it('registers every type once and under a listed category', () => {
    const types = drawingTools.all().map((t) => t.type)
    expect(new Set(types).size).toBe(types.length)
    const listed = new Set(CATEGORIES.map(([c]) => c))
    for (const t of drawingTools.all()) expect(listed.has(t.category), t.type).toBe(true)
  })

  it('names the two position tools as analytical drawings: the registry carries no order verb', () => {
    for (const type of ['long_position', 'short_position']) {
      const def = drawingTools.get(type)!
      expect(def.category).toBe('forecasting')
      expect(def.placement).toBe('instant')
    }
  })
})
