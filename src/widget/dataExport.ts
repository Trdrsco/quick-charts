// Download chart data: the bars the chart currently holds, written as CSV.
//
// This is a LOCAL export and nothing else. It writes what is already loaded and painted, so what
// lands in the file is exactly what the viewer is looking at: no second history request, no server
// export endpoint, and no reach past the boundary a replay cursor is holding. The chart hands the
// command its painted bars, which are already the replay slice while replay is on, so a revealed
// bar is exported and a bar the cursor has not reached is not.
import type { FeedBar } from '../datafeed'

/** The columns, in the order a viewer's spreadsheet expects them. */
const HEADER = 'time,open,high,low,close,volume'

/** One CSV cell, quoted when its own text would otherwise break the row. Bar numbers never need
 *  it; a cell is escaped anyway so a future value cannot silently split a column. */
export function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** A bar number as the file writes it: a finite value, or an empty cell for one the feed omitted.
 *  An empty cell is honest about a missing volume; a zero would not be. */
const cell = (value: number | undefined): string => (typeof value === 'number' && Number.isFinite(value) ? csvField(String(value)) : '')

/** The loaded bars as CSV: an ISO 8601 UTC timestamp and the bar's OHLC and volume. UTC because a
 *  file outlives the session that wrote it and a local offset in it could not be read back. */
export function barsToCsv(bars: readonly FeedBar[]): string {
  const lines = [HEADER]
  for (const bar of bars) {
    lines.push([csvField(new Date(bar.t * 1000).toISOString()), cell(bar.o), cell(bar.h), cell(bar.l), cell(bar.c), cell(bar.v)].join(','))
  }
  return lines.join('\n')
}

/** The download's filename: the symbol and the timeframe, with anything a file system would argue
 *  about replaced. A symbol carrying a comma or a quote is a name, not a column. */
export function dataFileName(symbol: string, timeframe: string): string {
  const safe = symbol.replace(/[^A-Za-z0-9._-]+/g, '_') || 'chart'
  return `${safe}_${timeframe}.csv`
}

export interface BarsDownload {
  bars: readonly FeedBar[]
  symbol: string
  timeframe: string
  /** A name the caller chose, over the symbol-and-timeframe default. */
  name?: string
}

/** Write the bars to the viewer's downloads. Answers whether there was anything to write: an empty
 *  chart downloads nothing rather than an empty file. */
export function downloadBarsCsv(download: BarsDownload): boolean {
  if (download.bars.length === 0) return false
  const blob = new Blob([barsToCsv(download.bars)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = download.name ?? dataFileName(download.symbol, download.timeframe)
  link.click()
  // Revoking on the next task lets the click's own download start before the URL is dropped.
  setTimeout(() => URL.revokeObjectURL(url), 0)
  return true
}
