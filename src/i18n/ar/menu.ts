import type { Translation } from '../runtime'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': 'إعادة تعيين عرض الرسم البياني',
  'menu.copyPrice': 'نسخ السعر {price}',
  'menu.paste': 'لصق',
  'menu.removeIndicators': { zero: 'حذف {count} مؤشر', one: 'حذف {count} مؤشر', two: 'حذف {count} مؤشرين', few: 'حذف {count} مؤشرات', many: 'حذف {count} مؤشراً', other: 'حذف {count} مؤشر' },
  'menu.removeDrawings': { zero: 'حذف {count} رسم', one: 'حذف {count} رسم', two: 'حذف {count} رسمين', few: 'حذف {count} رسوم', many: 'حذف {count} رسماً', other: 'حذف {count} رسم' },
  'menu.settings': 'الإعدادات…',
}
