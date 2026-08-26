import type { Translation } from '@trdrs/i18n'
import type { account as source } from '../en/account'

export const account: Translation<typeof source> = {
  'account.positions': 'Pozycje',
  'account.orders': 'Zlecenia',
  'account.positionsCount': 'Pozycje ({count})',
  'account.ordersCount': 'Zlecenia ({count})',
  'account.noPositions': 'Brak otwartych pozycji',
  'account.noOrders': 'Brak aktywnych zleceń',
  'account.long': 'Długa {qty}',
  'account.short': 'Krótka {qty}',
  'account.close': 'Zamknij',
  'account.closeTitle': 'Zamknij {instrument} po cenie rynkowej',
  'account.reverse': 'Odwróć',
  'account.reverseTitle': 'Odwróć {instrument}',
  'account.reversed': { one: 'Odwrócono {instrument} (anulowano {count} zlecenie)', few: 'Odwrócono {instrument} (anulowano {count} zlecenia)', many: 'Odwrócono {instrument} (anulowano {count} zleceń)', other: 'Odwrócono {instrument} (anulowano {count} zlecenia)' },
  'account.buy': 'Kup {qty} {type}',
  'account.sell': 'Sprzedaj {qty} {type}',
  'account.cancel': 'Anuluj',
  'account.cancelTitle': 'Anuluj {id}',
}
