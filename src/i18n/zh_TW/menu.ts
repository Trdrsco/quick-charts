import type { Translation } from '@trdrs/i18n'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': '重設圖表檢視',
  'menu.copyPrice': '複製價格{price}',
  'menu.paste': '貼上',
  'menu.addAlert': '在{symbol}的{price}新增警示…',
  'menu.addOrder': '在{symbol}的{price}新增訂單…',
  'menu.sellLimit': '限價賣出{at}',
  'menu.buyStop': '停損買進{at}',
  'menu.buyLimit': '限價買進{at}',
  'menu.sellStop': '停損賣出{at}',
  'menu.removeIndicators': { other: '移除{count}個指標' },
  'menu.removeDrawings': { other: '移除{count}個繪圖' },
  'menu.hideMarks': '隱藏K線上的標記',
  'menu.settings': '設定…',
}
