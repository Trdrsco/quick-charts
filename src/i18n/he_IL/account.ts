import type { Translation } from '@trdrs/i18n'
import type { account as source } from '../en/account'

export const account: Translation<typeof source> = {
  'account.positions': 'פוזיציות',
  'account.orders': 'פקודות',
  'account.positionsCount': 'פוזיציות ({count})',
  'account.ordersCount': 'פקודות ({count})',
  'account.noPositions': 'אין פוזיציות פתוחות',
  'account.noOrders': 'אין פקודות פעילות',
  'account.long': 'לונג {qty}',
  'account.short': 'שורט {qty}',
  'account.close': 'סגירה',
  'account.closeTitle': 'סגירת {instrument} בשוק',
  'account.reverse': 'היפוך',
  'account.reverseTitle': 'היפוך {instrument}',
  'account.reversed': { one: 'הפוזיציה ב-{instrument} הופכה ({count} פקודה בוטלה)', two: 'הפוזיציה ב-{instrument} הופכה ({count} פקודות בוטלו)', other: 'הפוזיציה ב-{instrument} הופכה ({count} פקודות בוטלו)' },
  'account.buy': 'קנייה {qty} {type}',
  'account.sell': 'מכירה {qty} {type}',
  'account.cancel': 'ביטול',
  'account.cancelTitle': 'ביטול {id}',
}
