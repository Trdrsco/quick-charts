import type { Translation } from '../runtime'
import type { picker as source } from '../en/picker'

export const picker: Translation<typeof source> = {
  'picker.title': 'المؤشرات',
  'picker.search': 'البحث عن مؤشرات',
  'picker.noMatches': 'لا توجد مؤشرات مطابقة.',
  'picker.collections': 'مجموعات المؤشرات',
  'picker.personal': 'شخصية',
  'picker.builtin': 'مضمّنة',
  'picker.favorites': 'المفضلة',
  'picker.thousands': ' K',
  'picker.name': 'الاسم',
  'picker.author': 'المؤلف',
  'picker.favorite': 'إضافة {name} إلى المفضلة',
  'picker.unfavorite': 'إزالة {name} من المفضلة',
  'picker.loading': 'جارٍ تحميل المؤشرات…',
  'picker.unavailable': 'محتوى المؤشرات غير متاح. حاول مرة أخرى.',
  'picker.actionFailed': 'تعذر إكمال الإجراء. حاول مرة أخرى.',
  'picker.add': 'إضافة {name}',
  'picker.notPermitted': '{name} غير متاح هنا',
}
