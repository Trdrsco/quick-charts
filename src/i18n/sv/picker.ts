import type { Translation } from '../runtime'
import type { picker as source } from '../en/picker'

export const picker: Translation<typeof source> = {
  'picker.title': 'Indikatorer',
  'picker.search': 'Sök indikatorer',
  'picker.noMatches': 'Inga matchande indikatorer.',
  'picker.collections': 'Indikatorsamlingar',
  'picker.personal': 'Personliga',
  'picker.builtin': 'Inbyggda',
  'picker.favorites': 'Favoriter',
  'picker.thousands': ' K',
  'picker.name': 'Namn',
  'picker.author': 'Skapare',
  'picker.favorite': 'Lägg till {name} i favoriter',
  'picker.unfavorite': 'Ta bort {name} från favoriter',
  'picker.loading': 'Läser in indikatorer…',
  'picker.unavailable': 'Indikatorinnehållet är inte tillgängligt. Försök igen.',
  'picker.actionFailed': 'Åtgärden kunde inte slutföras. Försök igen.',
  'picker.add': 'Lägg till {name}',
  'picker.notPermitted': '{name} är inte tillgänglig här',
}
