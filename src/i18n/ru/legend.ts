import type { Translation } from '../runtime'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.open': 'O',
  'legend.high': 'H',
  'legend.low': 'L',
  'legend.close': 'C',
  'legend.change': '{change} ({percent}%)',
  'legend.volume': 'Vol',
  'legend.indicatorSettings': 'Настройки индикатора',
  'legend.showRows': 'Показать строки индикаторов',
  'legend.hideRows': 'Скрыть строки индикаторов',
  'legend.restorePane': 'Вернуть размер панели',
  'legend.collapsePane': 'Свернуть панель',
  'legend.maximizePane': 'Развернуть панель',
  'legend.showIndicator': 'Показать индикатор',
  'legend.hideIndicator': 'Скрыть индикатор',
  'legend.scaleNormal': 'Обыч.',
  'legend.scaleLog': 'Лог.',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.changeSymbol': 'Сменить инструмент',
  'legend.removeCompare': 'Удалить сравнение',
  'legend.removeIndicator': 'Remove indicator',
}
