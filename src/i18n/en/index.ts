import { legend } from './legend'

/** The widget's SOURCE catalog: every string its own chrome shows, in English, one file per
 *  surface. Every language the widget ships is typed against this shape. Symbols, prices and
 *  anything the datafeed or broker says pass through untranslated — they are data, not interface. */
export const en = { ...legend } as const

export type ChartMessageKey = keyof typeof en

/** The catalogs `en` is assembled from, for the test that proves no key is defined twice. */
export const catalogs: readonly Readonly<Record<string, string | object>>[] = [legend]
