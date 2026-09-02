import type { Translation } from '../runtime'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': 'Réinitialiser la vue du graphique',
  'menu.copyPrice': 'Copier le prix {price}',
  'menu.paste': 'Coller',
  'menu.addAlert': 'Ajouter une alerte sur {symbol} à {price}…',
  'menu.addOrder': 'Ajouter un ordre sur {symbol} à {price}…',
  'menu.sellLimit': 'Vendre {at} limite',
  'menu.buyStop': 'Acheter {at} stop',
  'menu.buyLimit': 'Acheter {at} limite',
  'menu.sellStop': 'Vendre {at} stop',
  'menu.removeIndicators': { one: 'Supprimer {count} indicateur', many: 'Supprimer {count} indicateurs', other: 'Supprimer {count} indicateurs' },
  'menu.removeDrawings': { one: 'Supprimer {count} dessin', many: 'Supprimer {count} dessins', other: 'Supprimer {count} dessins' },
  'menu.hideMarks': 'Masquer les marques sur les barres',
  'menu.settings': 'Paramètres…',
}
