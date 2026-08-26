import type { Translation } from '@trdrs/i18n'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'Nguồn dữ liệu này không có khối lượng',
  'host.replayHeader': '{tf} · phát lại',
}
