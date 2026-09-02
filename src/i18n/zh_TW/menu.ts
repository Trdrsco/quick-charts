import type { Translation } from '../runtime'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': '重設圖表檢視',
  'menu.copyPrice': '複製價格{price}',
  'menu.paste': '貼上',
  'menu.removeIndicators': { other: '移除{count}個指標' },
  'menu.removeDrawings': { other: '移除{count}個繪圖' },
  'menu.settings': '設定…',
}
