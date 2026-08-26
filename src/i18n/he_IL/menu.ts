import type { Translation } from '@trdrs/i18n'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': 'איפוס תצוגת הגרף',
  'menu.copyPrice': 'העתקת מחיר {price}',
  'menu.paste': 'הדבקה',
  'menu.addAlert': 'הוספת התראה על {symbol} ב-{price}…',
  'menu.addOrder': 'הוספת פקודה על {symbol} ב-{price}…',
  'menu.sellLimit': 'מכירה {at} לימיט',
  'menu.buyStop': 'קנייה {at} סטופ',
  'menu.buyLimit': 'קנייה {at} לימיט',
  'menu.sellStop': 'מכירה {at} סטופ',
  'menu.removeIndicators': { one: 'הסרת {count} אינדיקטור', two: 'הסרת {count} אינדיקטורים', other: 'הסרת {count} אינדיקטורים' },
  'menu.removeDrawings': { one: 'הסרת {count} ציור', two: 'הסרת {count} ציורים', other: 'הסרת {count} ציורים' },
  'menu.hideMarks': 'הסתרת סימונים על הנרות',
  'menu.settings': 'הגדרות…',
}
