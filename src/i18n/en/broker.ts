// What the broker seam says to the trader: rejections, refusals, confirmations. These are the
// WIDGET's own words about a gesture it will not send. A refusal that comes from the host's price
// policy, or from the backend, is that system's own text and passes through untouched.
export const broker = {
  // A drop that resolves to nothing to act on.
  'broker.positionAlreadyClosed': 'Position already closed',
  'broker.orderNotWorking': 'Order no longer working',

  // A drop that cannot be priced.
  'broker.tickUnknownReprice': 'Tick size unknown, cannot reprice',
  'broker.pricesUnknownReprice': 'Order prices unknown, cannot reprice',
  'broker.noLimitBand': 'No current limit price to band against',
  'broker.noStopBand': 'No current stop price to band against',
  'broker.noStopAnchor': 'No price to anchor the stop against',
  'broker.tickUnknown': 'Tick size unknown',
  'broker.noAnchor': 'No anchor',
  'broker.takeProfitAbove': 'Take profit must be above the entry',
  'broker.takeProfitBelow': 'Take profit must be below the entry',

  // What a completed action reports. `{price}` is at the tick's own precision.
  'broker.positionClosed': 'Position closed',
  'broker.orderCancelled': 'Order cancelled',
  'broker.targetMoved': 'Target moved to {price}',
  'broker.orderMoved': 'Order moved to {price}',
  'broker.triggerMoved': 'Trigger moved to {price}',
  'broker.limitMoved': 'Limit moved to {price}',
  'broker.stopMoved': 'Stop moved to {price}',
  /** A protective stop moved with no live price to verify its side against. */
  'broker.stopSideUnverified': 'No live price, stop side unverified',
} as const
