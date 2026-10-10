import type { Translation } from '../runtime'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.open': 'O',
  'legend.high': 'Maks',
  'legend.low': 'Min',
  'legend.close': 'Z',
  'legend.change': '{change} ({percent}%)',
  'legend.volume': 'Wol',
  'legend.indicatorSettings': 'Ustawienia wskaźnika',
  'legend.showRows': 'Pokaż wiersze wskaźników',
  'legend.hideRows': 'Ukryj wiersze wskaźników',
  'legend.restorePane': 'Przywróć panel wykresu',
  'legend.collapsePane': 'Zwiń panel wykresu',
  'legend.maximizePane': 'Maksymalizuj panel wykresu',
  'legend.movePaneUp': 'Move pane up',
  'legend.movePaneDown': 'Move pane down',
  'legend.showIndicator': 'Pokaż wskaźnik',
  'legend.hideIndicator': 'Ukryj wskaźnik',
  'legend.scaleNormal': 'Zwy',
  'legend.scaleLog': 'Log',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.changeSymbol': 'Zmień symbol',
  'legend.removeCompare': 'Usuń porównanie',
  'legend.removeIndicator': 'Usuń wskaźnik',
}
