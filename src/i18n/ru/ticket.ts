import type { Translation } from '../runtime'
import type { ticket as source } from '../en/ticket'

export const ticket: Translation<typeof source> = {
  'ticket.typeMarket': 'Рыночный',
  'ticket.typeLimit': 'Лимитный',
  'ticket.typeStop': 'Стоп',
  'ticket.typeStopLimit': 'Стоп-лимит',
  'ticket.noAccount': 'Счет не выбран — подключите счет, чтобы выставлять ордера.',
  'ticket.locked': 'Торговля по этому счету заблокирована.',
  'ticket.needsPrice': 'Для ордера нужна цена.',
  'ticket.cannotPlace': 'Эта интеграция не выставляет ордера.',
  'ticket.placedBuy': 'Ордер на покупку {qty} {type} выставлен',
  'ticket.placedSell': 'Ордер на продажу {qty} {type} выставлен',
}
