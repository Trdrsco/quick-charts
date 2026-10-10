import type { Translation } from '../runtime'
import type { toast as source } from '../en/toast'

export const toast: Translation<typeof source> = {
  'toast.dismiss': 'Schließen',
  'toast.feedUnavailable': 'Keine Daten für {symbol} aus diesem Feed.',
  'toast.feedNoData': 'Noch keine Daten für {symbol}.',
  'toast.imageCopyFallback': 'Das Bild konnte nicht kopiert werden. Stattdessen wurde eine Datei gespeichert.',
  'toast.imageFailed': 'Das Chartbild konnte nicht erstellt werden.',
  'toast.indicatorsNotCarried': { one: '{count} Indikator dieses gespeicherten Charts ist hier nicht verfügbar und wurde weggelassen.', other: '{count} Indikatoren dieses gespeicherten Charts sind hier nicht verfügbar und wurden weggelassen.' },
}
