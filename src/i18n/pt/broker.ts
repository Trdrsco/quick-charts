import type { Translation } from '@trdrs/i18n'
import type { broker as source } from '../en/broker'

export const broker: Translation<typeof source> = {
  'broker.positionAlreadyClosed': 'Posição já fechada',
  'broker.orderNotWorking': 'Ordem não está mais ativa',
  'broker.tickUnknownReprice': 'Tamanho do tick desconhecido, não é possível reprecificar',
  'broker.pricesUnknownReprice': 'Preços da ordem desconhecidos, não é possível reprecificar',
  'broker.noLimitBand': 'Nenhum preço limite atual para servir de referência',
  'broker.noStopBand': 'Nenhum preço de stop atual para servir de referência',
  'broker.noStopAnchor': 'Nenhum preço para ancorar o stop',
  'broker.tickUnknown': 'Tamanho do tick desconhecido',
  'broker.noAnchor': 'Sem âncora',
  'broker.takeProfitAbove': 'O take profit deve ficar acima da entrada',
  'broker.takeProfitBelow': 'O take profit deve ficar abaixo da entrada',
  'broker.positionClosed': 'Posição fechada',
  'broker.orderCancelled': 'Ordem cancelada',
  'broker.targetMoved': 'Alvo movido para {price}',
  'broker.orderMoved': 'Ordem movida para {price}',
  'broker.triggerMoved': 'Disparo movido para {price}',
  'broker.limitMoved': 'Limite movido para {price}',
  'broker.stopMoved': 'Stop movido para {price}',
  'broker.stopSideUnverified': 'Sem preço ao vivo, lado do stop não verificado',
}
