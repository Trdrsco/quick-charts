import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'Sem volume neste feed',
  'host.replayHeader': '{tf} · replay',
}
