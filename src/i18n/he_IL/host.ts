import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'אין מחזור בפיד הזה',
  'host.saveConflict': 'נשמר במקום אחר מאז שנפתח. יש לטעון את הגרסה החדשה יותר לפני השמירה.',
  'host.saveNotFound': 'הפריט נמחק במקום אחר. יש לשמור אותו שוב כחדש.',
  'host.loadInvalid': 'לא ניתן היה לפתוח. שום דבר במסך לא השתנה.',
  'host.loadUnavailable': 'לא ניתן היה לגשת לעבודה השמורה. שום דבר במסך לא השתנה.',
  'host.loadNotRestored': 'לא ניתן היה לפתוח, וגם לא ניתן היה להחזיר את מה שהיה במסך. הגרף לא נשמר עד שתיפתח פריסה או גרף שמורים. כדי לשמור את מה שבמסך, יש לשמור קודם עותק.',
  'host.notSaving': 'הגרף לא נשמר. כדי להתחיל ממצב ידוע, יש לפתוח גרף או פריסה שמורים. שמירת עותק משמרת את מה שבמסך, אבל הגרף עדיין לא יישמר.',
}
