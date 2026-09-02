import type { Translation } from '../runtime'
import type { range as source } from '../en/range'

export const range: Translation<typeof source> = {
  'range.oneDay': '1 dia',
  'range.fiveDays': '5 dias',
  'range.oneMonth': '1 mês',
  'range.threeMonths': '3 meses',
  'range.sixMonths': '6 meses',
  'range.yearToDate': 'No ano',
  'range.oneYear': '1 ano',
  'range.fiveYears': '5 anos',
  'range.all': 'Todos os dados',
  'range.tip': '{range} · candles de {interval}',
  'range.zoomIn': 'Aproximar',
  'range.zoomOut': 'Afastar',
  'range.scrollLeft': 'Rolar para a esquerda',
  'range.scrollRight': 'Rolar para a direita',
  'range.reset': 'Redefinir visualização do gráfico',
}
