import type { Translation } from '../runtime'
import type { picker as source } from '../en/picker'

export const picker: Translation<typeof source> = {
  'picker.title': 'Индикаторы',
  'picker.search': 'Поиск индикаторов',
  'picker.noMatches': 'Подходящих индикаторов нет.',
  'picker.collections': 'Наборы индикаторов',
  'picker.personal': 'Личные',
  'picker.builtin': 'Встроенные',
  'picker.favorites': 'Избранное',
  'picker.thousands': ' K',
  'picker.name': 'Название',
  'picker.author': 'Автор',
  'picker.favorite': 'Добавить в избранное: {name}',
  'picker.unfavorite': 'Удалить из избранного: {name}',
  'picker.loading': 'Загрузка индикаторов…',
  'picker.unavailable': 'Индикаторы недоступны. Повторите попытку.',
  'picker.actionFailed': 'Не удалось выполнить действие. Повторите попытку.',
  'picker.add': 'Добавить {name}',
  'picker.notPermitted': '{name} здесь недоступен',
}
