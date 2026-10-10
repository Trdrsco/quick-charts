import type { Translation } from '../runtime'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.open': 'Откр',
  'legend.high': 'Макс',
  'legend.low': 'Мин',
  'legend.close': 'Закр',
  'legend.change': '{change} ({percent}%)',
  'legend.volume': 'Объем',
  'legend.indicatorSettings': 'Настройки индикатора',
  'legend.showRows': 'Показать строки индикаторов',
  'legend.hideRows': 'Скрыть строки индикаторов',
  'legend.restorePane': 'Вернуть размер панели',
  'legend.collapsePane': 'Свернуть панель',
  'legend.maximizePane': 'Развернуть панель',
  'legend.movePaneUp': 'Move pane up',
  'legend.movePaneDown': 'Move pane down',
  'legend.showIndicator': 'Показать индикатор',
  'legend.hideIndicator': 'Скрыть индикатор',
  'legend.scaleNormal': 'Обыч.',
  'legend.scaleLog': 'Лог.',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.changeSymbol': 'Сменить инструмент',
  'legend.removeCompare': 'Удалить сравнение',
  'legend.removeIndicator': 'Удалить индикатор',
}
