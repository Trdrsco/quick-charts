import type { Translation } from '../runtime'
import type { session as source } from '../en/session'

export const session: Translation<typeof source> = {
  'session.pre': '장 시작 전',
  'session.open': '정규장',
  'session.extended': 'Extended hours',
  'session.after': '장 마감 후',
  'session.closed': '시장 휴장',
}
