import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'Este feed no aporta volumen',
  'host.replayHeader': '{tf} · repetición',
}
