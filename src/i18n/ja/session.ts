import type { Translation } from '../runtime'
import type { session as source } from '../en/session'

export const session: Translation<typeof source> = {
  'session.pre': '寄り付き前',
  'session.open': '取引時間中',
  'session.eth': '電子取引時間',
  'session.after': '時間外',
  'session.closed': '取引終了',
}
