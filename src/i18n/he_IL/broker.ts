import type { Translation } from '@trdrs/i18n'
import type { broker as source } from '../en/broker'

export const broker: Translation<typeof source> = {
  'broker.positionAlreadyClosed': 'הפוזיציה כבר נסגרה',
  'broker.orderNotWorking': 'הפקודה אינה פעילה יותר',
  'broker.tickUnknownReprice': 'גודל הטיק אינו ידוע, אי אפשר לעדכן את המחיר',
  'broker.pricesUnknownReprice': 'מחירי הפקודה אינם ידועים, אי אפשר לעדכן את המחיר',
  'broker.noLimitBand': 'אין מחיר לימיט נוכחי לחישוב הטווח',
  'broker.noStopBand': 'אין מחיר סטופ נוכחי לחישוב הטווח',
  'broker.noStopAnchor': 'אין מחיר לעגן אליו את הסטופ',
  'broker.tickUnknown': 'גודל הטיק אינו ידוע',
  'broker.noAnchor': 'אין עוגן',
  'broker.takeProfitAbove': 'הטייק פרופיט חייב להיות מעל הכניסה',
  'broker.takeProfitBelow': 'הטייק פרופיט חייב להיות מתחת לכניסה',
  'broker.positionClosed': 'הפוזיציה נסגרה',
  'broker.orderCancelled': 'הפקודה בוטלה',
  'broker.targetMoved': 'היעד הועבר ל-{price}',
  'broker.orderMoved': 'הפקודה הועברה ל-{price}',
  'broker.triggerMoved': 'הטריגר הועבר ל-{price}',
  'broker.limitMoved': 'הלימיט הועבר ל-{price}',
  'broker.stopMoved': 'הסטופ הועבר ל-{price}',
  'broker.stopSideUnverified': 'אין מחיר בזמן אמת, צד הסטופ לא אומת',
}
