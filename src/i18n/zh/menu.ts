import type { Translation } from '../runtime'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': '重置图表视图',
  'menu.copyPrice': '复制价格{price}',
  'menu.paste': '粘贴',
  'menu.addAlert': '在{symbol}的{price}添加提醒…',
  'menu.addOrder': '在{symbol}的{price}添加订单…',
  'menu.sellLimit': '在{at}限价卖出',
  'menu.buyStop': '在{at}止损买入',
  'menu.buyLimit': '在{at}限价买入',
  'menu.sellStop': '在{at}止损卖出',
  'menu.removeIndicators': { other: '移除{count}个指标' },
  'menu.removeDrawings': { other: '移除{count}个绘图' },
  'menu.hideMarks': '隐藏K线上的标记',
  'menu.settings': '设置…',
}
