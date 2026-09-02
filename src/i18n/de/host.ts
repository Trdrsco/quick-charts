import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'Kein Volumen von diesem Feed',
  'host.replayHeader': '{tf} · Wiedergabe',
  'host.saveConflict': 'Saved elsewhere since you opened it. Load the newer version before saving.',
  'host.saveNotFound': 'This was deleted elsewhere. Save it again as new.',
}
