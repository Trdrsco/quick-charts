import type { Translation } from '@trdrs/i18n'
import type { session as source } from '../en/session'

export const session: Translation<typeof source> = {
  'session.pre': '장 시작 전',
  'session.open': '정규장',
  'session.eth': '전자거래 시간',
  'session.after': '장 마감 후',
  'session.closed': '시장 휴장',
}
