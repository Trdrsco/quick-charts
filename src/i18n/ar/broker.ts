import type { Translation } from '@trdrs/i18n'
import type { broker as source } from '../en/broker'

export const broker: Translation<typeof source> = {
  'broker.positionAlreadyClosed': 'المركز مغلق بالفعل',
  'broker.orderNotWorking': 'الأمر لم يعد قيد التنفيذ',
  'broker.tickUnknownReprice': 'حجم النقطة غير معروف، لا يمكن تغيير السعر',
  'broker.pricesUnknownReprice': 'أسعار الأمر غير معروفة، لا يمكن تغيير السعر',
  'broker.noLimitBand': 'لا يوجد سعر محدد حالي لقياس النطاق عليه',
  'broker.noStopBand': 'لا يوجد سعر وقف حالي لقياس النطاق عليه',
  'broker.noStopAnchor': 'لا يوجد سعر يُبنى عليه الوقف',
  'broker.tickUnknown': 'حجم النقطة غير معروف',
  'broker.noAnchor': 'لا يوجد سعر مرجعي',
  'broker.takeProfitAbove': 'يجب أن يكون جني الأرباح أعلى من سعر الدخول',
  'broker.takeProfitBelow': 'يجب أن يكون جني الأرباح أدنى من سعر الدخول',
  'broker.positionClosed': 'تم إغلاق المركز',
  'broker.orderCancelled': 'تم إلغاء الأمر',
  'broker.targetMoved': 'تم نقل الهدف إلى {price}',
  'broker.orderMoved': 'تم نقل الأمر إلى {price}',
  'broker.triggerMoved': 'تم نقل سعر التحفيز إلى {price}',
  'broker.limitMoved': 'تم نقل السعر المحدد إلى {price}',
  'broker.stopMoved': 'تم نقل الوقف إلى {price}',
  'broker.stopSideUnverified': 'لا يوجد سعر مباشر، لم يتم التحقق من جهة الوقف',
}
