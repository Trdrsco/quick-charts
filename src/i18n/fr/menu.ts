import type { Translation } from '../runtime'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': 'Réinitialiser la vue du graphique',
  'menu.copyPrice': 'Copier le prix {price}',
  'menu.paste': 'Coller',
  'menu.removeIndicators': { one: 'Supprimer {count} indicateur', many: 'Supprimer {count} indicateurs', other: 'Supprimer {count} indicateurs' },
  'menu.removeDrawings': { one: 'Supprimer {count} dessin', many: 'Supprimer {count} dessins', other: 'Supprimer {count} dessins' },
  'menu.settings': 'Paramètres…',
}
