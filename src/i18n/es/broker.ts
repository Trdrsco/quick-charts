import type { Translation } from '@trdrs/i18n'
import type { broker as source } from '../en/broker'

export const broker: Translation<typeof source> = {
  'broker.positionAlreadyClosed': 'La posición ya está cerrada',
  'broker.orderNotWorking': 'La orden ya no está activa',
  'broker.tickUnknownReprice': 'Tamaño del tick desconocido, no se puede cambiar el precio',
  'broker.pricesUnknownReprice': 'Precios de la orden desconocidos, no se puede cambiar el precio',
  'broker.noLimitBand': 'No hay precio límite actual con el que acotar',
  'broker.noStopBand': 'No hay precio stop actual con el que acotar',
  'broker.noStopAnchor': 'No hay precio con el que anclar el stop',
  'broker.tickUnknown': 'Tamaño del tick desconocido',
  'broker.noAnchor': 'Sin ancla',
  'broker.takeProfitAbove': 'El take profit debe estar por encima de la entrada',
  'broker.takeProfitBelow': 'El take profit debe estar por debajo de la entrada',
  'broker.positionClosed': 'Posición cerrada',
  'broker.orderCancelled': 'Orden cancelada',
  'broker.targetMoved': 'Objetivo movido a {price}',
  'broker.orderMoved': 'Orden movida a {price}',
  'broker.triggerMoved': 'Disparador movido a {price}',
  'broker.limitMoved': 'Límite movido a {price}',
  'broker.stopMoved': 'Stop movido a {price}',
  'broker.stopSideUnverified': 'Sin precio en vivo, el lado del stop no se ha verificado',
}
