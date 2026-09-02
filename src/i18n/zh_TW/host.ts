import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': '此行情來源不提供成交量',
  'host.replayHeader': '{tf} · 回放',
  'host.saveConflict': 'Saved elsewhere since you opened it. Load the newer version before saving.',
  'host.saveNotFound': 'This was deleted elsewhere. Save it again as new.',
}
