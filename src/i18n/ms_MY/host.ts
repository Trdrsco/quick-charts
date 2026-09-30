import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'Tiada volum daripada suapan ini',
  'host.saveConflict': 'Saved elsewhere since you opened it. Load the newer version before saving.',
  'host.saveNotFound': 'This was deleted elsewhere. Save it again as new.',
  'host.loadInvalid': 'This could not be opened. Nothing on screen changed.',
  'host.loadUnavailable': 'Your saved work could not be reached. Nothing on screen changed.',
  'host.loadNotRestored': 'This could not be opened, and what was on screen could not be put back. The chart is not saving until you open a saved chart or layout. Save a copy first to keep what is on screen.',
  'host.notSaving': 'The chart is not saving. Open a saved chart or layout to start from a known state. Saving a copy keeps what is on screen, but the chart still will not save.',
}
