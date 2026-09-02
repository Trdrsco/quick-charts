import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': '이 피드는 거래량을 제공하지 않습니다',
  'host.replayHeader': '{tf} · 리플레이',
  'host.saveConflict': 'Saved elsewhere since you opened it. Load the newer version before saving.',
  'host.saveNotFound': 'This was deleted elsewhere. Save it again as new.',
}
