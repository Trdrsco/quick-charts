// Strings the widget host itself shows: indicator notes, empty states, errors. An indicator's own
// title comes from its manifest and a feed's status code is the feed's, so neither is a key here.
export const host = {
  /** A volume-scaled indicator on a feed that serves no volume: the plot is withheld rather than
   *  drawn flat, and the chip says why. */
  'host.noVolume': 'No volume from this feed',
  /** The legend header while bar replay is on; `{tf}` is the timeframe token. */
  'host.replayHeader': '{tf} · replay',
} as const
