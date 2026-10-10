import type { Translation } from '../runtime'
import type { toast as source } from '../en/toast'

export const toast: Translation<typeof source> = {
  'toast.dismiss': 'Stäng',
  'toast.feedUnavailable': 'Inga data för {symbol} från det här flödet.',
  'toast.feedNoData': 'Inga data för {symbol} ännu.',
  'toast.imageCopyFallback': 'Bilden kunde inte kopieras. En fil sparades i stället.',
  'toast.imageFailed': 'Det gick inte att ta en bild av diagrammet.',
  'toast.indicatorsNotCarried': { one: '{count} indikator i det sparade diagrammet är inte tillgänglig här och utelämnades.', other: '{count} indikatorer i det sparade diagrammet är inte tillgängliga här och utelämnades.' },
}
