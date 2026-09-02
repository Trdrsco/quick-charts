// Strings the widget host itself shows: indicator notes, empty states, errors. A built-in's name is a
// key in indicators.ts, a host-defined indicator's title comes from its manifest, and a feed's
// status code is the feed's, so none of those is a key here.
export const host = {
  /** A volume-scaled indicator on a feed that serves no volume: the plot is withheld rather than
   *  drawn flat, and the chip says why. */
  'host.noVolume': 'No volume from this feed',
  /** The legend header while bar replay is on; `{tf}` is the timeframe token. */
  'host.replayHeader': '{tf} · replay',
  /** A save refused because the resource moved on since it was opened: the chart never overwrites
   *  newer work, and the host shows this beside its reload affordance. */
  'host.saveConflict': 'Saved elsewhere since you opened it. Load the newer version before saving.',
  /** A save or delete refused because the resource no longer exists. */
  'host.saveNotFound': 'This was deleted elsewhere. Save it again as new.',
} as const
