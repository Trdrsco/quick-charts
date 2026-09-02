import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'Этот поток не передает объем',
  'host.replayHeader': '{tf} · воспроизведение',
}
