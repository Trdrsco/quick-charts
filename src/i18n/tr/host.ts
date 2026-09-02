import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'Bu veri akışında hacim yok',
  'host.replayHeader': '{tf} · tekrar oynatma',
}
