import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'Ingen volym från detta flöde',
  'host.replayHeader': '{tf} · uppspelning',
}
