import type { Translation } from '../runtime'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': 'Сбросить вид графика',
  'menu.copyPrice': 'Копировать цену {price}',
  'menu.paste': 'Вставить',
  'menu.removeIndicators': { one: 'Удалить {count} индикатор', few: 'Удалить {count} индикатора', many: 'Удалить {count} индикаторов', other: 'Удалить {count} индикатора' },
  'menu.removeDrawings': { one: 'Удалить {count} рисунок', few: 'Удалить {count} рисунка', many: 'Удалить {count} рисунков', other: 'Удалить {count} рисунка' },
  'menu.settings': 'Настройки…',
}
