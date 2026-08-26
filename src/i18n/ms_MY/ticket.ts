import type { Translation } from '@trdrs/i18n'
import type { ticket as source } from '../en/ticket'

export const ticket: Translation<typeof source> = {
  'ticket.typeMarket': 'Pasaran',
  'ticket.typeLimit': 'Limit',
  'ticket.typeStop': 'Henti',
  'ticket.typeStopLimit': 'Henti Limit',
  'ticket.noAccount': 'Tiada akaun diaktifkan — sambungkan akaun untuk menghantar pesanan.',
  'ticket.locked': 'Dagangan dikunci untuk akaun ini.',
  'ticket.needsPrice': 'Pesanan ini perlukan harga.',
  'ticket.cannotPlace': 'Integrasi ini tidak menghantar pesanan.',
  'ticket.placedBuy': 'Beli {qty} {type} dihantar',
  'ticket.placedSell': 'Jual {qty} {type} dihantar',
}
