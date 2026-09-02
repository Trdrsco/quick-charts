import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'Nessun volume da questo feed',
  'host.replayHeader': '{tf} · replay',
}
