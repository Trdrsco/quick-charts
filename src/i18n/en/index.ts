import { legend } from './legend'
import { tools } from './tools'
import { rail } from './rail'
import { menu } from './menu'
import { replay } from './replay'
import { inputs } from './inputs'
import { session } from './session'
import { layouts } from './layouts'
import { host } from './host'
import { indicators } from './indicators'
import { timeframe } from './timeframe'
import { timezone } from './timezone'
import { range } from './range'
import { status } from './status'
import { search } from './search'
import { drawing } from './drawing'

/** The widget's SOURCE catalog: every string its own chrome shows, in English, one file per
 *  surface. Every language the widget ships is typed against this shape. Symbols, prices and
 *  anything the datafeed says pass through untranslated — they are data, not interface. */
export const en = { ...legend, ...tools, ...rail, ...menu, ...replay, ...inputs, ...session, ...layouts, ...host, ...indicators, ...timeframe, ...timezone, ...range, ...status, ...search, ...drawing } as const

export type ChartMessageKey = keyof typeof en

/** The catalogs `en` is assembled from, for the test that proves no key is defined twice. */
export const catalogs: readonly Readonly<Record<string, string | object>>[] = [legend, tools, rail, menu, replay, inputs, session, layouts, host, indicators, timeframe, timezone, range, status, search, drawing]
