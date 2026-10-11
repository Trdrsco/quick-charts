import type { Translation } from '../runtime'
import type { picker as source } from '../en/picker'

export const picker: Translation<typeof source> = {
  'picker.title': 'Indikatoren',
  'picker.search': 'Indikatoren suchen',
  'picker.noMatches': 'Keine passenden Indikatoren.',
  'picker.collections': 'Indikatorsammlungen',
  'picker.personal': 'Persönlich',
  'picker.builtin': 'Integriert',
  'picker.favorites': 'Favoriten',
  'picker.thousands': ' K',
  'picker.name': 'Name',
  'picker.author': 'Autor',
  'picker.favorite': '{name} zu Favoriten hinzufügen',
  'picker.unfavorite': '{name} aus Favoriten entfernen',
  'picker.loading': 'Indikatoren werden geladen…',
  'picker.unavailable': 'Indikatorinhalte sind nicht verfügbar. Bitte erneut versuchen.',
  'picker.actionFailed': 'Die Aktion konnte nicht ausgeführt werden. Bitte erneut versuchen.',
  'picker.add': '{name} hinzufügen',
  'picker.notPermitted': '{name} ist hier nicht verfügbar',
}
