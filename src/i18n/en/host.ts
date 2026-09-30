// Strings the widget host itself shows: indicator notes, empty states, errors. A built-in's name is a
// key in indicators.ts, a host-defined indicator's title comes from its manifest, and a feed's
// status code is the feed's, so none of those is a key here.
export const host = {
  /** A volume-scaled indicator on a feed that serves no volume: the plot is withheld rather than
   *  drawn flat, and the chip says why. */
  'host.noVolume': 'No volume from this feed',
  /** A save refused because the resource moved on since it was opened: the chart never overwrites
   *  newer work, and the host shows this beside its reload affordance. */
  'host.saveConflict': 'Saved elsewhere since you opened it. Load the newer version before saving.',
  /** A save or delete refused because the resource no longer exists. */
  'host.saveNotFound': 'This was deleted elsewhere. Save it again as new.',
  /** A load refused because the saved content could not be read: what is on screen is untouched,
   *  and it is still bound to whatever it was saved as. */
  'host.loadInvalid': 'This could not be opened. Nothing on screen changed.',
  /** A load that could not reach the store at all. The saved content may be perfectly good, so this
   *  says the saved work could not be read rather than that it is unreadable. */
  'host.loadUnavailable': 'Your saved work could not be reached. Nothing on screen changed.',
  /** A load refused part-way, where putting back what was on screen failed too: the save binding is
   *  untouched, but the screen holds neither the saved content nor what it had, so nothing is
   *  written until a load puts a whole one back. A copy is still offered, because what is on screen
   *  may be worth keeping. */
  'host.loadNotRestored':
    'This could not be opened, and what was on screen could not be put back. The chart is not saving until you open a saved chart or layout. Save a copy first to keep what is on screen.',
  /** A save refused because the screen holds content that could not be put back: writing it would
   *  put a half-applied chart over the last version that was whole. */
  'host.notSaving':
    'The chart is not saving. Open a saved chart or layout to start from a known state. Saving a copy keeps what is on screen, but the chart still will not save.',
} as const
