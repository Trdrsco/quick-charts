import type { Translation } from '@trdrs/i18n'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'אין מחזור בפיד הזה',
  'host.replayHeader': '{tf} · הפעלה חוזרת',
}
