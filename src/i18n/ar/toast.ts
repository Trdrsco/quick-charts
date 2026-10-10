import type { Translation } from '../runtime'
import type { toast as source } from '../en/toast'

export const toast: Translation<typeof source> = {
  'toast.dismiss': 'إغلاق',
  'toast.feedUnavailable': 'لا توجد بيانات لـ {symbol} من مصدر البيانات هذا.',
  'toast.feedNoData': 'لا توجد بيانات لـ {symbol} بعد.',
  'toast.imageCopyFallback': 'تعذر نسخ الصورة. تم حفظ ملف بدلاً من ذلك.',
  'toast.imageFailed': 'تعذر التقاط صورة الرسم البياني.',
  'toast.indicatorsNotCarried': { zero: '{count} مؤشر في هذا الرسم البياني المحفوظ غير متاح هنا وقد استُبعد.', one: '{count} مؤشر في هذا الرسم البياني المحفوظ غير متاح هنا وقد استُبعد.', two: '{count} مؤشران في هذا الرسم البياني المحفوظ غير متاحين هنا وقد استُبعدا.', few: '{count} مؤشرات في هذا الرسم البياني المحفوظ غير متاحة هنا وقد استُبعدت.', many: '{count} مؤشراً في هذا الرسم البياني المحفوظ غير متاحة هنا وقد استُبعدت.', other: '{count} مؤشر في هذا الرسم البياني المحفوظ غير متاحة هنا وقد استُبعدت.' },
}
