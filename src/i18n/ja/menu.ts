import type { Translation } from '../runtime'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': 'チャート表示をリセット',
  'menu.copyPrice': '価格{price}をコピー',
  'menu.paste': '貼り付け',
  'menu.addAlert': '{symbol}の{price}にアラートを追加…',
  'menu.addOrder': '{symbol}の{price}に注文を追加…',
  'menu.sellLimit': '{at}で売り指値',
  'menu.buyStop': '{at}で買い逆指値',
  'menu.buyLimit': '{at}で買い指値',
  'menu.sellStop': '{at}で売り逆指値',
  'menu.removeIndicators': { other: 'インジケーター{count}件を削除' },
  'menu.removeDrawings': { other: '描画{count}件を削除' },
  'menu.hideMarks': 'バー上のマークを非表示',
  'menu.settings': '設定…',
}
