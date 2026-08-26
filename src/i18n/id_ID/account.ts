import type { Translation } from '@trdrs/i18n'
import type { account as source } from '../en/account'

export const account: Translation<typeof source> = {
  'account.positions': 'Posisi',
  'account.orders': 'Order',
  'account.positionsCount': 'Posisi ({count})',
  'account.ordersCount': 'Order ({count})',
  'account.noPositions': 'Tidak ada posisi terbuka',
  'account.noOrders': 'Tidak ada order aktif',
  'account.long': 'Long {qty}',
  'account.short': 'Short {qty}',
  'account.close': 'Tutup',
  'account.closeTitle': 'Tutup {instrument} di harga pasar',
  'account.reverse': 'Balik arah',
  'account.reverseTitle': 'Balik arah {instrument}',
  'account.reversed': { other: '{instrument} dibalik arah ({count} order dibatalkan)' },
  'account.buy': 'Beli {qty} {type}',
  'account.sell': 'Jual {qty} {type}',
  'account.cancel': 'Batalkan',
  'account.cancelTitle': 'Batalkan {id}',
}
