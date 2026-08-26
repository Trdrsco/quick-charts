import type { Translation } from '@trdrs/i18n'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.indicatorSettings': 'Ustawienia wskaźnika',
  'legend.restorePane': 'Przywróć panel wykresu',
  'legend.collapsePane': 'Zwiń panel wykresu',
  'legend.maximizePane': 'Maksymalizuj panel wykresu',
  'legend.showIndicator': 'Pokaż wskaźnik',
  'legend.hideIndicator': 'Ukryj wskaźnik',
  'legend.priceScale': 'Skala ceny: {mode}',
  'legend.scaleNormal': 'Zwy',
  'legend.scaleLog': 'Log',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
}
