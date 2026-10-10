import type { Translation } from '../runtime'
import type { picker as source } from '../en/picker'

export const picker: Translation<typeof source> = {
  'picker.title': 'Indicateurs',
  'picker.search': 'Rechercher des indicateurs',
  'picker.noMatches': 'Aucun indicateur correspondant.',
  'picker.collections': 'Collections d\'indicateurs',
  'picker.personal': 'Personnels',
  'picker.builtin': 'Intégrés',
  'picker.favorites': 'Favoris',
  'picker.thousands': ' K',
  'picker.name': 'Nom',
  'picker.author': 'Auteur',
  'picker.favorite': 'Ajouter {name} aux favoris',
  'picker.unfavorite': 'Retirer {name} des favoris',
  'picker.loading': 'Chargement des indicateurs…',
  'picker.unavailable': 'Le contenu des indicateurs n\'est pas disponible. Réessayez.',
  'picker.actionFailed': 'L\'action n\'a pas pu aboutir. Réessayez.',
  'picker.add': 'Ajouter {name}',
  'picker.notPermitted': '{name} n\'est pas disponible ici',
}
