import type { Translation } from '@trdrs/i18n'
import type { account as source } from '../en/account'

export const account: Translation<typeof source> = {
  'account.positions': 'Pozisyonlar',
  'account.orders': 'Emirler',
  'account.positionsCount': 'Pozisyonlar ({count})',
  'account.ordersCount': 'Emirler ({count})',
  'account.noPositions': 'Açık pozisyon yok',
  'account.noOrders': 'Bekleyen emir yok',
  'account.long': 'Uzun {qty}',
  'account.short': 'Kısa {qty}',
  'account.close': 'Kapat',
  'account.closeTitle': '{instrument} pozisyonunu piyasadan kapat',
  'account.reverse': 'Ters çevir',
  'account.reverseTitle': '{instrument} pozisyonunu ters çevir',
  'account.reversed': { one: '{instrument} ters çevrildi ({count} emir iptal edildi)', other: '{instrument} ters çevrildi ({count} emir iptal edildi)' },
  'account.buy': '{qty} {type} al',
  'account.sell': '{qty} {type} sat',
  'account.cancel': 'İptal',
  'account.cancelTitle': '{id} emrini iptal et',
}
