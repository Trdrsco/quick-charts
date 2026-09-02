import type { Translation } from '../runtime'
import type { rail as source } from '../en/rail'

export const rail: Translation<typeof source> = {
  'rail.cursor': 'カーソル',
  'rail.deleteSelected': '選択した描画を削除',
  'rail.clearAll': 'すべての描画を消去',
}
