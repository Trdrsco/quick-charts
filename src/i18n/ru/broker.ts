import type { Translation } from '../runtime'
import type { broker as source } from '../en/broker'

export const broker: Translation<typeof source> = {
  'broker.positionAlreadyClosed': 'Позиция уже закрыта',
  'broker.orderNotWorking': 'Ордер больше не активен',
  'broker.tickUnknownReprice': 'Размер тика неизвестен, изменить цену нельзя',
  'broker.pricesUnknownReprice': 'Цены ордера неизвестны, изменить цену нельзя',
  'broker.noLimitBand': 'Нет текущей лимитной цены для расчета допустимого диапазона',
  'broker.noStopBand': 'Нет текущей стоп-цены для расчета допустимого диапазона',
  'broker.noStopAnchor': 'Нет цены, от которой отсчитать стоп',
  'broker.tickUnknown': 'Размер тика неизвестен',
  'broker.noAnchor': 'Нет точки отсчета',
  'broker.takeProfitAbove': 'Тейк-профит должен быть выше входа',
  'broker.takeProfitBelow': 'Тейк-профит должен быть ниже входа',
  'broker.positionClosed': 'Позиция закрыта',
  'broker.orderCancelled': 'Ордер отменен',
  'broker.targetMoved': 'Цель перенесена на {price}',
  'broker.orderMoved': 'Ордер перенесен на {price}',
  'broker.triggerMoved': 'Триггер перенесен на {price}',
  'broker.limitMoved': 'Лимит перенесен на {price}',
  'broker.stopMoved': 'Стоп перенесен на {price}',
  'broker.stopSideUnverified': 'Нет текущей цены, сторона стопа не проверена',
}
