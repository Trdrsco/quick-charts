import type { Translation } from '@trdrs/i18n'
import type { broker as source } from '../en/broker'

export const broker: Translation<typeof source> = {
  'broker.positionAlreadyClosed': 'Positionen är redan stängd',
  'broker.orderNotWorking': 'Ordern är inte längre aktiv',
  'broker.tickUnknownReprice': 'Ticksteg okänt, kan inte prissätta om',
  'broker.pricesUnknownReprice': 'Orderpriser okända, kan inte prissätta om',
  'broker.noLimitBand': 'Inget aktuellt limitpris att utgå från',
  'broker.noStopBand': 'Inget aktuellt stoppris att utgå från',
  'broker.noStopAnchor': 'Inget pris att ankra stoppen mot',
  'broker.tickUnknown': 'Ticksteg okänt',
  'broker.noAnchor': 'Inget ankare',
  'broker.takeProfitAbove': 'Take profit måste ligga över ingången',
  'broker.takeProfitBelow': 'Take profit måste ligga under ingången',
  'broker.positionClosed': 'Positionen stängd',
  'broker.orderCancelled': 'Ordern avbruten',
  'broker.targetMoved': 'Målet flyttat till {price}',
  'broker.orderMoved': 'Ordern flyttad till {price}',
  'broker.triggerMoved': 'Triggern flyttad till {price}',
  'broker.limitMoved': 'Limiten flyttad till {price}',
  'broker.stopMoved': 'Stoppen flyttad till {price}',
  'broker.stopSideUnverified': 'Inget livepris, stoppens sida overifierad',
}
