import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'لا يوفر هذا المصدر بيانات الحجم',
  'host.replayHeader': '{tf} · إعادة التشغيل',
}
