import type { Translation } from '@trdrs/i18n'
import type { broker as source } from '../en/broker'

export const broker: Translation<typeof source> = {
  'broker.positionAlreadyClosed': '部位已平倉',
  'broker.orderNotWorking': '訂單已不在掛單中',
  'broker.tickUnknownReprice': '跳動點值未知，無法重新報價',
  'broker.pricesUnknownReprice': '訂單價格未知，無法重新報價',
  'broker.noLimitBand': '沒有目前的限價可作為區間基準',
  'broker.noStopBand': '沒有目前的停損價可作為區間基準',
  'broker.noStopAnchor': '沒有價格可作為停損的基準',
  'broker.tickUnknown': '跳動點值未知',
  'broker.noAnchor': '沒有基準點',
  'broker.takeProfitAbove': '停利必須高於進場價',
  'broker.takeProfitBelow': '停利必須低於進場價',
  'broker.positionClosed': '部位已平倉',
  'broker.orderCancelled': '訂單已取消',
  'broker.targetMoved': '目標價已移至{price}',
  'broker.orderMoved': '訂單已移至{price}',
  'broker.triggerMoved': '觸發價已移至{price}',
  'broker.limitMoved': '限價已移至{price}',
  'broker.stopMoved': '停損已移至{price}',
  'broker.stopSideUnverified': '沒有即時價格，停損方向未驗證',
}
