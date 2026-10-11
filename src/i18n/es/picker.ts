import type { Translation } from '../runtime'
import type { picker as source } from '../en/picker'

export const picker: Translation<typeof source> = {
  'picker.title': 'Indicadores',
  'picker.search': 'Buscar indicadores',
  'picker.noMatches': 'No hay indicadores que coincidan.',
  'picker.collections': 'Colecciones de indicadores',
  'picker.personal': 'Personales',
  'picker.builtin': 'Integrados',
  'picker.favorites': 'Favoritos',
  'picker.thousands': ' K',
  'picker.name': 'Nombre',
  'picker.author': 'Autor',
  'picker.favorite': 'Añadir {name} a favoritos',
  'picker.unfavorite': 'Quitar {name} de favoritos',
  'picker.loading': 'Cargando indicadores…',
  'picker.unavailable': 'El contenido de los indicadores no está disponible. Inténtalo de nuevo.',
  'picker.actionFailed': 'No se pudo completar la acción. Inténtalo de nuevo.',
  'picker.add': 'Añadir {name}',
  'picker.notPermitted': '{name} no está disponible aquí',
}
