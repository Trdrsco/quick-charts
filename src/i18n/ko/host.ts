import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': '이 피드는 거래량을 제공하지 않습니다',
  'host.replayHeader': '{tf} · 리플레이',
}
