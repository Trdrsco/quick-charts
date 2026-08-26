import type { Translation } from '@trdrs/i18n'
import type { broker as source } from '../en/broker'

export const broker: Translation<typeof source> = {
  'broker.positionAlreadyClosed': '이미 청산된 포지션입니다',
  'broker.orderNotWorking': '더 이상 유효하지 않은 주문입니다',
  'broker.tickUnknownReprice': '틱 크기를 알 수 없어 가격을 변경할 수 없습니다',
  'broker.pricesUnknownReprice': '주문 가격을 알 수 없어 가격을 변경할 수 없습니다',
  'broker.noLimitBand': '기준으로 삼을 현재 지정가가 없습니다',
  'broker.noStopBand': '기준으로 삼을 현재 스톱 가격이 없습니다',
  'broker.noStopAnchor': '스톱의 기준이 될 가격이 없습니다',
  'broker.tickUnknown': '틱 크기를 알 수 없습니다',
  'broker.noAnchor': '기준점 없음',
  'broker.takeProfitAbove': '익절은 진입가보다 높아야 합니다',
  'broker.takeProfitBelow': '익절은 진입가보다 낮아야 합니다',
  'broker.positionClosed': '포지션이 청산되었습니다',
  'broker.orderCancelled': '주문이 취소되었습니다',
  'broker.targetMoved': '목표가를 {price}로 이동했습니다',
  'broker.orderMoved': '주문을 {price}로 이동했습니다',
  'broker.triggerMoved': '트리거를 {price}로 이동했습니다',
  'broker.limitMoved': '지정가를 {price}로 이동했습니다',
  'broker.stopMoved': '스톱을 {price}로 이동했습니다',
  'broker.stopSideUnverified': '실시간 가격이 없어 스톱 방향을 확인하지 못했습니다',
}
