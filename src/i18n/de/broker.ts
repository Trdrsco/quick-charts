import type { Translation } from '@trdrs/i18n'
import type { broker as source } from '../en/broker'

export const broker: Translation<typeof source> = {
  'broker.positionAlreadyClosed': 'Position bereits geschlossen',
  'broker.orderNotWorking': 'Order nicht mehr aktiv',
  'broker.tickUnknownReprice': 'Tickgröße unbekannt, Preis kann nicht geändert werden',
  'broker.pricesUnknownReprice': 'Orderpreise unbekannt, Preis kann nicht geändert werden',
  'broker.noLimitBand': 'Kein aktueller Limitpreis als Bezugspunkt',
  'broker.noStopBand': 'Kein aktueller Stoppreis als Bezugspunkt',
  'broker.noStopAnchor': 'Kein Preis, an dem der Stop verankert werden kann',
  'broker.tickUnknown': 'Tickgröße unbekannt',
  'broker.noAnchor': 'Kein Anker',
  'broker.takeProfitAbove': 'Take-Profit muss über dem Einstieg liegen',
  'broker.takeProfitBelow': 'Take-Profit muss unter dem Einstieg liegen',
  'broker.positionClosed': 'Position geschlossen',
  'broker.orderCancelled': 'Order storniert',
  'broker.targetMoved': 'Ziel auf {price} verschoben',
  'broker.orderMoved': 'Order auf {price} verschoben',
  'broker.triggerMoved': 'Auslöser auf {price} verschoben',
  'broker.limitMoved': 'Limit auf {price} verschoben',
  'broker.stopMoved': 'Stop auf {price} verschoben',
  'broker.stopSideUnverified': 'Kein Live-Preis, Stop-Seite nicht überprüft',
}
