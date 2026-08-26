import type { Translation } from '@trdrs/i18n'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': 'إعادة تعيين عرض الرسم البياني',
  'menu.copyPrice': 'نسخ السعر {price}',
  'menu.paste': 'لصق',
  'menu.addAlert': 'إضافة تنبيه على {symbol} عند {price}…',
  'menu.addOrder': 'إضافة أمر على {symbol} عند {price}…',
  'menu.sellLimit': 'بيع محدد عند {at}',
  'menu.buyStop': 'شراء وقف عند {at}',
  'menu.buyLimit': 'شراء محدد عند {at}',
  'menu.sellStop': 'بيع وقف عند {at}',
  'menu.removeIndicators': { zero: 'حذف {count} مؤشر', one: 'حذف {count} مؤشر', two: 'حذف {count} مؤشرين', few: 'حذف {count} مؤشرات', many: 'حذف {count} مؤشراً', other: 'حذف {count} مؤشر' },
  'menu.removeDrawings': { zero: 'حذف {count} رسم', one: 'حذف {count} رسم', two: 'حذف {count} رسمين', few: 'حذف {count} رسوم', many: 'حذف {count} رسماً', other: 'حذف {count} رسم' },
  'menu.hideMarks': 'إخفاء العلامات على الأشرطة',
  'menu.settings': 'الإعدادات…',
}
