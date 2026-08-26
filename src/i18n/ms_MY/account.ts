import type { Translation } from '@trdrs/i18n'
import type { account as source } from '../en/account'

export const account: Translation<typeof source> = {
  'account.positions': 'Posisi',
  'account.orders': 'Pesanan',
  'account.positionsCount': 'Posisi ({count})',
  'account.ordersCount': 'Pesanan ({count})',
  'account.noPositions': 'Tiada posisi terbuka',
  'account.noOrders': 'Tiada pesanan aktif',
  'account.long': 'Long {qty}',
  'account.short': 'Short {qty}',
  'account.close': 'Tutup',
  'account.closeTitle': 'Tutup {instrument} pada harga pasaran',
  'account.reverse': 'Balikkan',
  'account.reverseTitle': 'Balikkan {instrument}',
  'account.reversed': { other: '{instrument} dibalikkan ({count} pesanan dibatalkan)' },
  'account.buy': 'Beli {qty} {type}',
  'account.sell': 'Jual {qty} {type}',
  'account.cancel': 'Batal',
  'account.cancelTitle': 'Batalkan {id}',
}
