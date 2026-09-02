import type { Translation } from '../runtime'
import type { broker as source } from '../en/broker'

export const broker: Translation<typeof source> = {
  'broker.positionAlreadyClosed': 'Posizione già chiusa',
  'broker.orderNotWorking': 'L\'ordine non è più attivo',
  'broker.tickUnknownReprice': 'Dimensione del tick sconosciuta, impossibile modificare il prezzo',
  'broker.pricesUnknownReprice': 'Prezzi dell\'ordine sconosciuti, impossibile modificare il prezzo',
  'broker.noLimitBand': 'Nessun prezzo limite attuale su cui calcolare la banda',
  'broker.noStopBand': 'Nessun prezzo stop attuale su cui calcolare la banda',
  'broker.noStopAnchor': 'Nessun prezzo su cui ancorare lo stop',
  'broker.tickUnknown': 'Dimensione del tick sconosciuta',
  'broker.noAnchor': 'Nessun ancoraggio',
  'broker.takeProfitAbove': 'Il take profit deve essere sopra l\'ingresso',
  'broker.takeProfitBelow': 'Il take profit deve essere sotto l\'ingresso',
  'broker.positionClosed': 'Posizione chiusa',
  'broker.orderCancelled': 'Ordine annullato',
  'broker.targetMoved': 'Obiettivo spostato a {price}',
  'broker.orderMoved': 'Ordine spostato a {price}',
  'broker.triggerMoved': 'Trigger spostato a {price}',
  'broker.limitMoved': 'Limit spostato a {price}',
  'broker.stopMoved': 'Stop spostato a {price}',
  'broker.stopSideUnverified': 'Nessun prezzo in tempo reale, lato dello stop non verificato',
}
