import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'Aucun volume sur ce flux',
  'host.replayHeader': '{tf} · relecture',
}
