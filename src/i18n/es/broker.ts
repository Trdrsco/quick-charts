import type { Translation } from '@trdrs/i18n'
import type { broker as source } from '../en/broker'

export const broker: Translation<typeof source> = {
  'broker.positionAlreadyClosed': 'Position already closed',
  'broker.orderNotWorking': 'Order no longer working',
  'broker.tickUnknownReprice': 'Tick size unknown, cannot reprice',
  'broker.pricesUnknownReprice': 'Order prices unknown, cannot reprice',
  'broker.noLimitBand': 'No current limit price to band against',
  'broker.noStopBand': 'No current stop price to band against',
  'broker.noStopAnchor': 'No price to anchor the stop against',
  'broker.tickUnknown': 'Tick size unknown',
  'broker.noAnchor': 'No anchor',
  'broker.takeProfitAbove': 'Take profit must be above the entry',
  'broker.takeProfitBelow': 'Take profit must be below the entry',
  'broker.positionClosed': 'Position closed',
  'broker.orderCancelled': 'Order cancelled',
  'broker.targetMoved': 'Target moved to {price}',
  'broker.orderMoved': 'Order moved to {price}',
  'broker.triggerMoved': 'Trigger moved to {price}',
  'broker.limitMoved': 'Limit moved to {price}',
  'broker.stopMoved': 'Stop moved to {price}',
  'broker.stopSideUnverified': 'No live price, stop side unverified',
}
