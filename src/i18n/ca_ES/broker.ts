import type { Translation } from '@trdrs/i18n'
import type { broker as source } from '../en/broker'

export const broker: Translation<typeof source> = {
  'broker.positionAlreadyClosed': 'La posició ja està tancada',
  'broker.orderNotWorking': 'L’ordre ja no està activa',
  'broker.tickUnknownReprice': 'Mida del tick desconeguda, no es pot canviar el preu',
  'broker.pricesUnknownReprice': 'Preus de l’ordre desconeguts, no es pot canviar el preu',
  'broker.noLimitBand': 'No hi ha cap preu límit actual per acotar',
  'broker.noStopBand': 'No hi ha cap preu stop actual per acotar',
  'broker.noStopAnchor': 'No hi ha cap preu per ancorar-hi l’stop',
  'broker.tickUnknown': 'Mida del tick desconeguda',
  'broker.noAnchor': 'Sense àncora',
  'broker.takeProfitAbove': 'El take profit ha de ser per damunt de l’entrada',
  'broker.takeProfitBelow': 'El take profit ha de ser per sota de l’entrada',
  'broker.positionClosed': 'Posició tancada',
  'broker.orderCancelled': 'Ordre cancel·lada',
  'broker.targetMoved': 'Objectiu mogut a {price}',
  'broker.orderMoved': 'Ordre moguda a {price}',
  'broker.triggerMoved': 'Activador mogut a {price}',
  'broker.limitMoved': 'Límit mogut a {price}',
  'broker.stopMoved': 'Stop mogut a {price}',
  'broker.stopSideUnverified': 'Sense preu en directe, costat de l’stop no verificat',
}
