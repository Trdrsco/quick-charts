import type { Translation } from '@trdrs/i18n'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'Nessun volume da questo feed',
  'host.replayHeader': '{tf} · replay',
}
