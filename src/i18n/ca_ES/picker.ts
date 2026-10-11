import type { Translation } from '../runtime'
import type { picker as source } from '../en/picker'

export const picker: Translation<typeof source> = {
  'picker.title': 'Indicadors',
  'picker.search': 'Cerca indicadors',
  'picker.noMatches': 'No hi ha indicadors que coincideixin.',
  'picker.collections': 'Col·leccions d’indicadors',
  'picker.personal': 'Personals',
  'picker.builtin': 'Integrats',
  'picker.favorites': 'Preferits',
  'picker.thousands': ' K',
  'picker.name': 'Nom',
  'picker.author': 'Autor',
  'picker.favorite': 'Afegeix {name} als preferits',
  'picker.unfavorite': 'Treu {name} dels preferits',
  'picker.loading': 'S’estan carregant els indicadors…',
  'picker.unavailable': 'El contingut dels indicadors no està disponible. Torna-ho a provar.',
  'picker.actionFailed': 'No s’ha pogut completar l’acció. Torna-ho a provar.',
  'picker.add': 'Afegeix {name}',
  'picker.notPermitted': '{name} no està disponible aquí',
}
