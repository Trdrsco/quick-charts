import type { Translation } from '@trdrs/i18n'
import type { account as source } from '../en/account'

export const account: Translation<typeof source> = {
  'account.positions': 'المراكز',
  'account.orders': 'الأوامر',
  'account.positionsCount': 'المراكز ({count})',
  'account.ordersCount': 'الأوامر ({count})',
  'account.noPositions': 'لا توجد مراكز مفتوحة',
  'account.noOrders': 'لا توجد أوامر قيد التنفيذ',
  'account.long': 'شراء {qty}',
  'account.short': 'بيع {qty}',
  'account.close': 'إغلاق',
  'account.closeTitle': 'إغلاق {instrument} بسعر السوق',
  'account.reverse': 'عكس',
  'account.reverseTitle': 'عكس {instrument}',
  'account.reversed': { zero: 'تم عكس {instrument} (إلغاء {count} أمر)', one: 'تم عكس {instrument} (إلغاء {count} أمر)', two: 'تم عكس {instrument} (إلغاء {count} أمرين)', few: 'تم عكس {instrument} (إلغاء {count} أوامر)', many: 'تم عكس {instrument} (إلغاء {count} أمراً)', other: 'تم عكس {instrument} (إلغاء {count} أمر)' },
  'account.buy': 'شراء {qty} {type}',
  'account.sell': 'بيع {qty} {type}',
  'account.cancel': 'إلغاء',
  'account.cancelTitle': 'إلغاء {id}',
}
