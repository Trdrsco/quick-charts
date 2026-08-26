import type { Translation } from '@trdrs/i18n'
import type { ticket as source } from '../en/ticket'

export const ticket: Translation<typeof source> = {
  'ticket.typeMarket': 'Piyasa',
  'ticket.typeLimit': 'Limit',
  'ticket.typeStop': 'Stop',
  'ticket.typeStopLimit': 'Stop Limit',
  'ticket.noAccount': 'Etkin hesap yok — emir vermek için bir hesap bağlayın.',
  'ticket.locked': 'Bu hesapta işlem kilitli.',
  'ticket.needsPrice': 'Emrin bir fiyata ihtiyacı var.',
  'ticket.cannotPlace': 'Bu entegrasyon emir göndermiyor.',
  'ticket.placedBuy': '{qty} {type} alış emri verildi',
  'ticket.placedSell': '{qty} {type} satış emri verildi',
}
