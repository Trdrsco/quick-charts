import type { Translation } from '@trdrs/i18n'
import type { ticket as source } from '../en/ticket'

export const ticket: Translation<typeof source> = {
  'ticket.typeMarket': 'Marché',
  'ticket.typeLimit': 'Limite',
  'ticket.typeStop': 'Stop',
  'ticket.typeStopLimit': 'Stop limite',
  'ticket.noAccount': 'Aucun compte armé — connectez un compte pour passer des ordres.',
  'ticket.locked': 'Le trading est verrouillé pour ce compte.',
  'ticket.needsPrice': 'L\'ordre exige un prix.',
  'ticket.cannotPlace': 'Cette intégration ne passe pas d\'ordres.',
  'ticket.placedBuy': 'Ordre d\'achat {qty} {type} envoyé',
  'ticket.placedSell': 'Ordre de vente {qty} {type} envoyé',
}
