import type { Translation } from '@trdrs/i18n'
import type { marks as source } from '../en/marks'

export const marks: Translation<typeof source> = {
  'marks.buy': 'Compra',
  'marks.sell': 'Venta',
  'marks.avgPrice': '{qty} a {price} de precio medio',
  'marks.trades': 'OPERACIONES',
}
