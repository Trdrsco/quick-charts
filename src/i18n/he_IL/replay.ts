import type { Translation } from '@trdrs/i18n'
import type { replay as source } from '../en/replay'

export const replay: Translation<typeof source> = {
  'replay.stepBack': 'צעד נר אחד אחורה',
  'replay.play': 'הפעלה',
  'replay.pause': 'השהיה',
  'replay.stepForward': 'צעד נר אחד קדימה',
  'replay.speed': 'מהירות ההפעלה החוזרת (עדכונים בשנייה)',
  'replay.interval': 'מרווח עדכון (הנרות נבנים מנרות אמיתיים קצרים יותר)',
  'replay.auto': 'אוטומטי',
  'replay.goLive': 'מעבר לזמן אמת',
  'replay.goLiveTitle': 'דילוג לקצה של זמן אמת',
  'replay.exit': 'יציאה מהפעלה חוזרת',
}
