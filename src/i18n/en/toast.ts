// The chart's own notices: a feed that cannot serve the symbol, an image that could not be copied,
// a save that was refused. A notice that quotes a host's message (a save conflict's sentence, a
// layout error) carries the message as data.
export const toast = {
  'toast.dismiss': 'Dismiss',
  /** The feed refused the symbol for good; `{symbol}` is data. */
  'toast.feedUnavailable': 'No data for {symbol} from this feed.',
  /** The feed answered with no bars yet. */
  'toast.feedNoData': 'No data for {symbol} yet.',
  'toast.imageCopyFallback': 'Could not copy the image. Saved a file instead.',
  'toast.imageFailed': 'Could not capture the chart image.',
  /** Saved definitions that are unavailable or denied are left out and counted together. */
  'toast.indicatorsNotCarried': {
    one: '{count} indicator in this saved chart is not available here and was left out.',
    other: '{count} indicators in this saved chart are not available here and were left out.',
  },
} as const
