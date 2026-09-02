import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'Kein Volumen von diesem Feed',
  'host.replayHeader': '{tf} · Wiedergabe',
}
