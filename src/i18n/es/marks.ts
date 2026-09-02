import type { Translation } from '../runtime'
import type { marks as source } from '../en/marks'

export const marks: Translation<typeof source> = {
  'marks.buy': 'Compra',
  'marks.sell': 'Venta',
  'marks.avgPrice': '{qty} a {price} de precio medio',
  'marks.trades': 'OPERACIONES',
}
