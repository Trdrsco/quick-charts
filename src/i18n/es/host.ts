import type { Translation } from '@trdrs/i18n'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'Este feed no aporta volumen',
  'host.replayHeader': '{tf} · repetición',
}
