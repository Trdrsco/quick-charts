import { legend } from './legend'
import { tools } from './tools'
import { rail } from './rail'
import { ticket } from './ticket'
import { account } from './account'
import { menu } from './menu'
import { lines } from './lines'
import { replay } from './replay'
import { inputs } from './inputs'
import { broker } from './broker'
import { session } from './session'
import { layouts } from './layouts'
import { marks } from './marks'
import { host } from './host'
import { panel } from './panel'

/** The widget's SOURCE catalog: every string its own chrome shows, in English, one file per
 *  surface. Every language the widget ships is typed against this shape. Symbols, prices and
 *  anything the datafeed or broker says pass through untranslated — they are data, not interface. */
export const en = { ...legend, ...tools, ...rail, ...ticket, ...account, ...menu, ...lines, ...replay, ...inputs, ...broker, ...session, ...layouts, ...marks, ...host, ...panel } as const

export type ChartMessageKey = keyof typeof en

/** The catalogs `en` is assembled from, for the test that proves no key is defined twice. */
export const catalogs: readonly Readonly<Record<string, string | object>>[] = [legend, tools, rail, ticket, account, menu, lines, replay, inputs, broker, session, layouts, marks, host, panel]
