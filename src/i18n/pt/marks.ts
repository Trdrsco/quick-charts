import type { Translation } from '../runtime'
import type { marks as source } from '../en/marks'

export const marks: Translation<typeof source> = {
  'marks.buy': 'Compra',
  'marks.sell': 'Venda',
  'marks.avgPrice': '{qty} @ {price} preço médio',
  'marks.trades': 'NEGÓCIOS',
}
