import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': '此数据源不提供成交量',
  'host.replayHeader': '{tf} · 回放',
}
