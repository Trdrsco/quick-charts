import type { Translation } from '../runtime'
import type { session as source } from '../en/session'

export const session: Translation<typeof source> = {
  'session.pre': 'Pra-pasar',
  'session.open': 'Pasar buka',
  'session.eth': 'Jam elektronik',
  'session.after': 'Setelah jam pasar',
  'session.closed': 'Pasar tutup',
}
