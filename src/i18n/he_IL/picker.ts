import type { Translation } from '../runtime'
import type { picker as source } from '../en/picker'

export const picker: Translation<typeof source> = {
  'picker.title': 'אינדיקטורים',
  'picker.search': 'חיפוש אינדיקטורים',
  'picker.noMatches': 'אין אינדיקטורים תואמים.',
  'picker.collections': 'אוספי אינדיקטורים',
  'picker.personal': 'אישיים',
  'picker.builtin': 'מובנים',
  'picker.favorites': 'מועדפים',
  'picker.thousands': ' K',
  'picker.name': 'שם',
  'picker.author': 'יוצר',
  'picker.favorite': 'הוספת {name} למועדפים',
  'picker.unfavorite': 'הסרת {name} מהמועדפים',
  'picker.loading': 'טוען אינדיקטורים…',
  'picker.unavailable': 'תוכן האינדיקטורים אינו זמין. אפשר לנסות שוב.',
  'picker.actionFailed': 'לא ניתן היה להשלים את הפעולה. אפשר לנסות שוב.',
  'picker.add': 'הוספת {name}',
  'picker.notPermitted': '{name} אינו זמין כאן',
}
