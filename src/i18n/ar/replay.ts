import type { Translation } from '../runtime'
import type { replay as source } from '../en/replay'

export const replay: Translation<typeof source> = {
  'replay.stepBack': 'الرجوع شريطاً واحداً',
  'replay.play': 'تشغيل',
  'replay.pause': 'إيقاف مؤقت',
  'replay.stepForward': 'التقدم شريطاً واحداً',
  'replay.speed': 'سرعة إعادة التشغيل (تحديثات في الثانية)',
  'replay.interval': 'فترة التحديث (تتكوّن الأشرطة من أشرطة حقيقية أدق)',
  'replay.auto': 'تلقائي',
  'replay.goLive': 'الانتقال للمباشر',
  'replay.goLiveTitle': 'الانتقال إلى الحد المباشر',
  'replay.exit': 'إنهاء إعادة التشغيل',
}
