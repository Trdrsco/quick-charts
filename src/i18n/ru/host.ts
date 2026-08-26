import type { Translation } from '@trdrs/i18n'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'Этот поток не передает объем',
  'host.replayHeader': '{tf} · воспроизведение',
}
