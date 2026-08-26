import type { Translation } from '@trdrs/i18n'
import type { ticket as source } from '../en/ticket'

export const ticket: Translation<typeof source> = {
  'ticket.typeMarket': 'Market',
  'ticket.typeLimit': 'Limit',
  'ticket.typeStop': 'Stop',
  'ticket.typeStopLimit': 'Stop Limit',
  'ticket.noAccount': 'Tidak ada akun yang diaktifkan — hubungkan akun untuk menempatkan order.',
  'ticket.locked': 'Trading dikunci untuk akun ini.',
  'ticket.needsPrice': 'Order ini memerlukan harga.',
  'ticket.cannotPlace': 'Integrasi ini tidak menempatkan order.',
  'ticket.placedBuy': 'Beli {qty} {type} ditempatkan',
  'ticket.placedSell': 'Jual {qty} {type} ditempatkan',
}
