import type { Translation } from '../runtime'
import type { picker as source } from '../en/picker'

export const picker: Translation<typeof source> = {
  'picker.title': 'Indicators',
  'picker.search': 'Search indicators',
  'picker.noMatches': 'No matching indicators.',
  'picker.collections': 'Indicator collections',
  'picker.personal': 'Personal',
  'picker.builtin': 'Built-in',
  'picker.favorites': 'Favorites',
  'picker.thousands': ' K',
  'picker.name': 'Name',
  'picker.author': 'Author',
  'picker.favorite': 'Favorite {name}',
  'picker.unfavorite': 'Unfavorite {name}',
  'picker.loading': 'Loading indicators…',
  'picker.unavailable': 'Indicator content is unavailable. Try again.',
  'picker.actionFailed': 'The action could not be completed. Try again.',
  'picker.add': 'Add {name}',
  'picker.notPermitted': '{name} is not available here',
}
