import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'אין מחזור בפיד הזה',
  'host.replayHeader': '{tf} · הפעלה חוזרת',
}
