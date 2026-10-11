import type { Translation } from '../runtime'
import type { toast as source } from '../en/toast'

export const toast: Translation<typeof source> = {
  'toast.dismiss': 'Descarta',
  'toast.feedUnavailable': 'No hi ha dades de {symbol} en aquesta font.',
  'toast.feedNoData': 'Encara no hi ha dades de {symbol}.',
  'toast.imageCopyFallback': 'No s’ha pogut copiar la imatge. S’ha desat un fitxer.',
  'toast.imageFailed': 'No s’ha pogut capturar la imatge del gràfic.',
  'toast.indicatorsNotCarried': { one: '{count} indicador d’aquest gràfic desat no està disponible aquí i s’ha omès.', many: '{count} indicadors d’aquest gràfic desat no estan disponibles aquí i s’han omès.', other: '{count} indicadors d’aquest gràfic desat no estan disponibles aquí i s’han omès.' },
}
