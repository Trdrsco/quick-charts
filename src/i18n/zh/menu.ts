import type { Translation } from '../runtime'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': '重置图表视图',
  'menu.copyPrice': '复制价格{price}',
  'menu.paste': '粘贴',
  'menu.removeIndicators': { other: '移除{count}个指标' },
  'menu.removeDrawings': { other: '移除{count}个绘图' },
  'menu.settings': '设置…',
  'menu.drawHorizontalLine': '在{price}处绘制水平线',
}
