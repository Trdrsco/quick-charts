import type { Translation } from '../runtime'
import type { toast as source } from '../en/toast'

export const toast: Translation<typeof source> = {
  'toast.dismiss': 'סגירה',
  'toast.feedUnavailable': 'אין נתונים עבור {symbol} מהפיד הזה.',
  'toast.feedNoData': 'אין עדיין נתונים עבור {symbol}.',
  'toast.imageCopyFallback': 'לא ניתן היה להעתיק את התמונה. במקום זאת נשמר קובץ.',
  'toast.imageFailed': 'לא ניתן היה לצלם את תמונת הגרף.',
  'toast.indicatorsNotCarried': { one: 'אינדיקטור {count} בגרף השמור הזה אינו זמין כאן והושמט.', two: '{count} אינדיקטורים בגרף השמור הזה אינם זמינים כאן והושמטו.', other: '{count} אינדיקטורים בגרף השמור הזה אינם זמינים כאן והושמטו.' },
}
