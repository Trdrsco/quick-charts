import type { Translation } from '../runtime'
import type { search as source } from '../en/search'

export const search: Translation<typeof source> = {
  'search.title': 'Поиск инструмента',
  'search.compareTitle': 'Сравнение инструментов',
  'search.changeSymbolTitle': 'Сменить инструмент',
  'search.placeholder': 'Search symbol',
  'search.clear': 'Очистить',
  'search.noMatches': 'Инструменты не найдены.',
  'search.loadingMore': 'Загрузка…',
  'search.failed': 'Search failed.',
  'search.samePercent': 'Та же шкала %',
  'search.newScale': 'Новая шкала цен',
  'search.newPane': 'Новая панель',
  'search.added': 'Добавленные инструменты',
  'search.recent': 'Недавние инструменты',
  'search.addedMark': '{symbol} уже на графике. Нажмите, чтобы удалить.',
  'search.compareEmpty': 'No symbols here yet. Why not add some?',
  'search.opDivision': 'Деление',
  'search.opSubtraction': 'Вычитание',
  'search.opAddition': 'Сложение',
  'search.opMultiplication': 'Умножение',
  'search.opExponentiation': 'Возведение в степень',
  'search.opReciprocal': 'Обратная величина',
  'search.opsHide': 'Скрыть операторы спреда',
  'search.opsShow': 'Показать операторы спреда',
}
