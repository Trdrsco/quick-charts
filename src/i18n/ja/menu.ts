import type { Translation } from '../runtime'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': 'チャート表示をリセット',
  'menu.copyPrice': '価格{price}をコピー',
  'menu.paste': '貼り付け',
  'menu.removeIndicators': { other: 'インジケーター{count}件を削除' },
  'menu.removeDrawings': { other: '描画{count}件を削除' },
  'menu.settings': '設定…',
}
