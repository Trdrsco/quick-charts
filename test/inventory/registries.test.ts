// @vitest-environment happy-dom
// The V1 registries pinned by stable id, from the package's own source: seven styles, 23 built-in
// indicators, 90 drawings, 55 layouts, 26 preset timeframes, and 60 timezone choices.
//
// ids.fixture.json is the sorted record of every registry the feature manifest publishes, the built-in
// locales, the theme roles and the command registry included. Every block below reads a registry as the
// package exports it and compares it to the fixture, so an id added, renamed or dropped anywhere fails
// here until the fixture moves with it in the same commit: an unapproved catalog change is a readable
// diff, never a count that drifted. counts.baseline.json still reads the six day-one literals off their
// source files; the cross-check at the end keeps the two records agreeing.
//
// happy-dom is here for the command census alone: the chrome harness registers the chart and widget
// verbs against a fake widget, and the box its overlays mount into is a DOM element.
import { describe, expect, it } from 'vitest'
import { ARRANGEMENTS, BUILT_IN_INDICATORS, BUILT_IN_LOCALES, CHART_STYLES, THEME_ROLES, TIMEFRAME_PRESETS, TIMEZONES } from '../../src/index'
import { drawingTools } from '../../src/drawings/index'
import { fakeWidget } from '../chrome/harness'
import baseline from './counts.baseline.json'
import fixture from './ids.fixture.json'

type Registry = keyof typeof fixture.registries

const sorted = (ids: readonly string[]): string[] => [...ids].sort()

/** Every command the widget registers: the real registry, with the real chart and widget
 *  registrations, against the harness's fake handle. */
function registeredCommands(): string[] {
  const w = fakeWidget()
  try {
    return sorted(w.commands.list().map((s) => s.id))
  } finally {
    w.dispose()
  }
}

/** Each registry as the package exports it, keyed the way the fixture and the feature manifest key it. */
const REGISTRIES: Record<Registry, () => string[]> = {
  styles: () => sorted(CHART_STYLES),
  indicators: () => sorted(BUILT_IN_INDICATORS.map((d) => d.id)),
  drawings: () => sorted(drawingTools.all().map((t) => t.type)),
  layouts: () => sorted(ARRANGEMENTS.map((a) => a.code)),
  timeframes: () => sorted(TIMEFRAME_PRESETS.flatMap((g) => g.tokens)),
  timezones: () => sorted(TIMEZONES.map((z) => z.id)),
  locales: () => sorted(BUILT_IN_LOCALES.map((l) => l.code)),
  themeRoles: () => sorted(THEME_ROLES.map((r) => r.id)),
  commands: registeredCommands,
}

/** The counts, stated once more as literals, so a fixture edited to a new length fails against a
 *  number someone wrote down and not only against itself. */
const COUNTS: Record<Registry, number> = {
  styles: 7,
  indicators: 23,
  drawings: 90,
  layouts: 55,
  timeframes: 26,
  timezones: 60,
  locales: 21,
  themeRoles: 63,
  commands: 194,
}

/** How counts.baseline.json names each registry the fixture also carries. */
const BASELINE_NAMES: Partial<Record<Registry, string>> = {
  styles: 'chart styles',
  indicators: 'built-in indicators',
  timeframes: 'preset timeframes',
  timezones: 'timezones',
  drawings: 'drawing tools',
  layouts: 'layout arrangements',
}

describe('the registry ids, from the package source', () => {
  for (const registry of Object.keys(REGISTRIES) as Registry[]) {
    describe(registry, () => {
      const ids = REGISTRIES[registry]()

      it(`holds exactly the ${COUNTS[registry]} pinned ids, sorted`, () => {
        expect(ids).toEqual(fixture.registries[registry])
        expect(ids).toHaveLength(COUNTS[registry])
      })

      it('names every id once, never blank', () => {
        expect(new Set(ids).size).toBe(ids.length)
        for (const id of ids) {
          expect(id.length, registry).toBeGreaterThan(0)
          expect(id.trim(), registry).toBe(id)
        }
      })
    })
  }

  it('agrees with the six day-one counts the baseline reads off the source literals', () => {
    for (const [registry, name] of Object.entries(BASELINE_NAMES) as [Registry, string][]) {
      const row = baseline.registries.find((r) => r.registry === name)
      expect(row, name).toBeDefined()
      expect(row!.count, name).toBe(fixture.registries[registry].length)
    }
  })
})
