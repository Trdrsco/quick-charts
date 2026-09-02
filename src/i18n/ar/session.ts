import type { Translation } from '../runtime'
import type { session as source } from '../en/session'

export const session: Translation<typeof source> = {
  'session.pre': 'ما قبل السوق',
  'session.open': 'السوق مفتوح',
  'session.extended': 'Extended hours',
  'session.after': 'ما بعد السوق',
  'session.closed': 'السوق مغلق',
}
