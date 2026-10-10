import type { Translation } from '../runtime'
import type { toast as source } from '../en/toast'

export const toast: Translation<typeof source> = {
  'toast.dismiss': 'Ignora',
  'toast.feedUnavailable': 'Nessun dato per {symbol} da questo feed.',
  'toast.feedNoData': 'Ancora nessun dato per {symbol}.',
  'toast.imageCopyFallback': 'Impossibile copiare l\'immagine. È stato salvato un file.',
  'toast.imageFailed': 'Impossibile acquisire l\'immagine del grafico.',
  'toast.indicatorsNotCarried': { one: '{count} indicatore di questo grafico salvato non è disponibile qui ed è stato omesso.', many: '{count} indicatori di questo grafico salvato non sono disponibili qui e sono stati omessi.', other: '{count} indicatori di questo grafico salvato non sono disponibili qui e sono stati omessi.' },
}
