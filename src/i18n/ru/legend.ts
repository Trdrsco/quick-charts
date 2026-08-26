import type { Translation } from '@trdrs/i18n'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.indicatorSettings': 'Настройки индикатора',
  'legend.restorePane': 'Вернуть размер панели',
  'legend.collapsePane': 'Свернуть панель',
  'legend.maximizePane': 'Развернуть панель',
  'legend.showIndicator': 'Показать индикатор',
  'legend.hideIndicator': 'Скрыть индикатор',
  'legend.priceScale': 'Шкала цены: {mode}',
  'legend.scaleNormal': 'Обыч.',
  'legend.scaleLog': 'Лог.',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
}
