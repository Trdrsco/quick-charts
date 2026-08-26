import type { Translation } from '@trdrs/i18n'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': '此行情來源不提供成交量',
  'host.replayHeader': '{tf} · 回放',
}
