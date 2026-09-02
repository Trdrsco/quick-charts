import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'このフィードには出来高がありません',
  'host.replayHeader': '{tf} · リプレイ',
}
