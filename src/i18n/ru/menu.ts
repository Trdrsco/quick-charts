import type { Translation } from '../runtime'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': 'Сбросить вид графика',
  'menu.copyPrice': 'Копировать цену {price}',
  'menu.paste': 'Вставить',
  'menu.addAlert': 'Добавить оповещение по {symbol} на {price}…',
  'menu.addOrder': 'Добавить ордер по {symbol} на {price}…',
  'menu.sellLimit': 'Продать по лимиту {at}',
  'menu.buyStop': 'Купить по стопу {at}',
  'menu.buyLimit': 'Купить по лимиту {at}',
  'menu.sellStop': 'Продать по стопу {at}',
  'menu.removeIndicators': { one: 'Удалить {count} индикатор', few: 'Удалить {count} индикатора', many: 'Удалить {count} индикаторов', other: 'Удалить {count} индикатора' },
  'menu.removeDrawings': { one: 'Удалить {count} рисунок', few: 'Удалить {count} рисунка', many: 'Удалить {count} рисунков', other: 'Удалить {count} рисунка' },
  'menu.hideMarks': 'Скрыть метки на барах',
  'menu.settings': 'Настройки…',
}
