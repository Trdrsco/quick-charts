import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'Nguồn dữ liệu này không có khối lượng',
  'host.replayHeader': '{tf} · phát lại',
}
