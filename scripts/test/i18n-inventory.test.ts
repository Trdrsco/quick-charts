// Two runtimes ship the same 21 locales: `@trdrs/i18n` for the app and the private organs, and the
// chart's own runtime inside `quickcharts`. Neither imports the other, so this is the pin that
// keeps their inventories equal (codes, canonical tags, reading direction, endonyms, order) and
// keeps the localization tooling reading each table exactly as its runtime declares it.
import { describe, expect, it } from 'vitest'
import { BUILT_IN_LOCALES as APP } from '../../packages/i18n/src/locales'
import { BUILT_IN_LOCALES as CHART } from '../../packages/chart/src/i18n/runtime/locales'
import { LOCALE_SOURCES, readLocales } from '../i18n-locales.mjs'

const row = ({ code, endonym, tag, dir }: { code: string; endonym: string; tag: string; dir: string }) => ({ code, endonym, tag, dir })

describe('the two locale inventories', () => {
  it('list the same 21 locales in the same order, with the same tags, directions, and endonyms', () => {
    expect(CHART).toHaveLength(21)
    expect(CHART.map(row)).toEqual(APP.map(row))
  })

  it('are read by the localization tooling exactly as each runtime declares them', () => {
    expect(readLocales(LOCALE_SOURCES.app)).toEqual(APP.map(row))
    expect(readLocales(LOCALE_SOURCES.sdk)).toEqual(CHART.map(row))
  })
})
