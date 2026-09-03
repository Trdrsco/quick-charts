import type { Translation } from '../runtime'
import type { picker as source } from '../en/picker'

export const picker: Translation<typeof source> = {
  'picker.title': 'Indicators',
  'picker.search': 'Search indicators',
  'picker.noMatches': 'No matching indicators.',
  'picker.add': 'Add {name}',
  'picker.notPermitted': '{name} is not available here',
  'picker.categoryMa': 'Moving averages',
  'picker.categoryBand': 'Bands and channels',
  'picker.categoryOsc': 'Oscillators',
  'picker.categoryVol': 'Volume',
}
