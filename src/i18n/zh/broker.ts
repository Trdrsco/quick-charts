import type { Translation } from '@trdrs/i18n'
import type { broker as source } from '../en/broker'

export const broker: Translation<typeof source> = {
  'broker.positionAlreadyClosed': '持仓已平',
  'broker.orderNotWorking': '订单已不再挂出',
  'broker.tickUnknownReprice': '最小变动价位未知，无法改价',
  'broker.pricesUnknownReprice': '订单价格未知，无法改价',
  'broker.noLimitBand': '当前无限价，无法设定价格区间',
  'broker.noStopBand': '当前无止损价，无法设定价格区间',
  'broker.noStopAnchor': '没有可作为止损基准的价格',
  'broker.tickUnknown': '最小变动价位未知',
  'broker.noAnchor': '无基准价',
  'broker.takeProfitAbove': '止盈必须高于入场价',
  'broker.takeProfitBelow': '止盈必须低于入场价',
  'broker.positionClosed': '持仓已平',
  'broker.orderCancelled': '订单已撤销',
  'broker.targetMoved': '目标价已移至{price}',
  'broker.orderMoved': '订单已移至{price}',
  'broker.triggerMoved': '触发价已移至{price}',
  'broker.limitMoved': '限价已移至{price}',
  'broker.stopMoved': '止损已移至{price}',
  'broker.stopSideUnverified': '无实时价格，止损方向未经校验',
}
