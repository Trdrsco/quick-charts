import type { Translation } from '../runtime'
import type { ticket as source } from '../en/ticket'

export const ticket: Translation<typeof source> = {
  'ticket.typeMarket': 'سوقي',
  'ticket.typeLimit': 'محدد',
  'ticket.typeStop': 'وقف',
  'ticket.typeStopLimit': 'وقف محدد',
  'ticket.noAccount': 'لا يوجد حساب مهيأ — اربط حساباً لإرسال الأوامر.',
  'ticket.locked': 'التداول مقفل على هذا الحساب.',
  'ticket.needsPrice': 'الأمر يحتاج إلى سعر.',
  'ticket.cannotPlace': 'هذا التكامل لا يرسل الأوامر.',
  'ticket.placedBuy': 'تم إرسال شراء {qty} {type}',
  'ticket.placedSell': 'تم إرسال بيع {qty} {type}',
}
