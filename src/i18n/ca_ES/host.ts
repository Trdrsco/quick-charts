import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'Aquest feed no proporciona volum',
  'host.replayHeader': '{tf} · repetició',
}
