import type { Translation } from '../runtime'
import type { picker as source } from '../en/picker'

export const picker: Translation<typeof source> = {
  'picker.title': 'Indicatori',
  'picker.search': 'Cerca indicatori',
  'picker.noMatches': 'Nessun indicatore corrispondente.',
  'picker.collections': 'Raccolte di indicatori',
  'picker.personal': 'Personali',
  'picker.builtin': 'Integrati',
  'picker.favorites': 'Preferiti',
  'picker.thousands': ' K',
  'picker.name': 'Nome',
  'picker.author': 'Autore',
  'picker.favorite': 'Aggiungi {name} ai preferiti',
  'picker.unfavorite': 'Rimuovi {name} dai preferiti',
  'picker.loading': 'Caricamento degli indicatori…',
  'picker.unavailable': 'Il contenuto degli indicatori non è disponibile. Riprova.',
  'picker.actionFailed': 'Impossibile completare l\'azione. Riprova.',
  'picker.add': 'Aggiungi {name}',
  'picker.notPermitted': '{name} non è disponibile qui',
}
