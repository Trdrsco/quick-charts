import type { Translation } from '../runtime'
import type { toast as source } from '../en/toast'

export const toast: Translation<typeof source> = {
  'toast.dismiss': 'Fermer',
  'toast.feedUnavailable': 'Aucune donnée pour {symbol} dans ce flux.',
  'toast.feedNoData': 'Aucune donnée pour {symbol} pour l\'instant.',
  'toast.imageCopyFallback': 'Impossible de copier l\'image. Un fichier a été enregistré à la place.',
  'toast.imageFailed': 'Impossible de capturer l\'image du graphique.',
  'toast.indicatorsNotCarried': { one: '{count} indicateur de ce graphique enregistré n\'est pas disponible ici et a été omis.', many: '{count} indicateurs de ce graphique enregistré ne sont pas disponibles ici et ont été omis.', other: '{count} indicateurs de ce graphique enregistré ne sont pas disponibles ici et ont été omis.' },
}
