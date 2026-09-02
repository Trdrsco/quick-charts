import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'Ten feed nie podaje wolumenu',
  'host.replayHeader': '{tf} · odtwarzanie',
}
