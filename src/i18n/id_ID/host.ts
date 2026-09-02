import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'Tidak ada volume dari feed ini',
  'host.replayHeader': '{tf} · pemutaran ulang',
}
