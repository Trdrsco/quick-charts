import type { Translation } from '@trdrs/i18n'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'Bu veri akışında hacim yok',
  'host.replayHeader': '{tf} · tekrar oynatma',
}
