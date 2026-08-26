import type { Translation } from '@trdrs/i18n'
import type { broker as source } from '../en/broker'

export const broker: Translation<typeof source> = {
  'broker.positionAlreadyClosed': 'Position déjà clôturée',
  'broker.orderNotWorking': 'Ordre plus actif',
  'broker.tickUnknownReprice': 'Taille du tick inconnue, impossible de repositionner le prix',
  'broker.pricesUnknownReprice': 'Prix de l\'ordre inconnus, impossible de repositionner le prix',
  'broker.noLimitBand': 'Aucun prix limite actuel pour encadrer le déplacement',
  'broker.noStopBand': 'Aucun prix stop actuel pour encadrer le déplacement',
  'broker.noStopAnchor': 'Aucun prix pour ancrer le stop',
  'broker.tickUnknown': 'Taille du tick inconnue',
  'broker.noAnchor': 'Aucun point d\'ancrage',
  'broker.takeProfitAbove': 'L\'objectif doit être au-dessus de l\'entrée',
  'broker.takeProfitBelow': 'L\'objectif doit être en dessous de l\'entrée',
  'broker.positionClosed': 'Position clôturée',
  'broker.orderCancelled': 'Ordre annulé',
  'broker.targetMoved': 'Objectif déplacé à {price}',
  'broker.orderMoved': 'Ordre déplacé à {price}',
  'broker.triggerMoved': 'Déclencheur déplacé à {price}',
  'broker.limitMoved': 'Limite déplacée à {price}',
  'broker.stopMoved': 'Stop déplacé à {price}',
  'broker.stopSideUnverified': 'Aucun prix en direct, côté du stop non vérifié',
}
