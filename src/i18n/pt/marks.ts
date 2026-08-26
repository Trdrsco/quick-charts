import type { Translation } from '@trdrs/i18n'
import type { marks as source } from '../en/marks'

export const marks: Translation<typeof source> = {
  'marks.buy': 'Compra',
  'marks.sell': 'Venda',
  'marks.avgPrice': '{qty} @ {price} preço médio',
  'marks.trades': 'NEGÓCIOS',
}
