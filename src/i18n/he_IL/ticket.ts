import type { Translation } from '@trdrs/i18n'
import type { ticket as source } from '../en/ticket'

export const ticket: Translation<typeof source> = {
  'ticket.typeMarket': 'שוק',
  'ticket.typeLimit': 'לימיט',
  'ticket.typeStop': 'סטופ',
  'ticket.typeStopLimit': 'סטופ לימיט',
  'ticket.noAccount': 'לא נבחר חשבון — חברו חשבון כדי לשלוח פקודות.',
  'ticket.locked': 'המסחר בחשבון הזה נעול.',
  'ticket.needsPrice': 'הפקודה דורשת מחיר.',
  'ticket.cannotPlace': 'האינטגרציה הזאת אינה שולחת פקודות.',
  'ticket.placedBuy': 'קנייה {qty} {type} נשלחה',
  'ticket.placedSell': 'מכירה {qty} {type} נשלחה',
}
