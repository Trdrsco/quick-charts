import type { Translation } from '@trdrs/i18n'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'لا يوفر هذا المصدر بيانات الحجم',
  'host.replayHeader': '{tf} · إعادة التشغيل',
}
