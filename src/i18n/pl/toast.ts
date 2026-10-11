import type { Translation } from '../runtime'
import type { toast as source } from '../en/toast'

export const toast: Translation<typeof source> = {
  'toast.dismiss': 'Zamknij',
  'toast.feedUnavailable': 'Brak danych dla {symbol} z tego źródła.',
  'toast.feedNoData': 'Brak jeszcze danych dla {symbol}.',
  'toast.imageCopyFallback': 'Nie udało się skopiować obrazu. Zamiast tego zapisano plik.',
  'toast.imageFailed': 'Nie udało się przechwycić obrazu wykresu.',
  'toast.indicatorsNotCarried': { one: '{count} wskaźnik z tego zapisanego wykresu jest tu niedostępny i został pominięty.', few: '{count} wskaźniki z tego zapisanego wykresu są tu niedostępne i zostały pominięte.', many: '{count} wskaźników z tego zapisanego wykresu jest tu niedostępnych i zostało pominiętych.', other: '{count} wskaźnika z tego zapisanego wykresu jest tu niedostępne i zostało pominięte.' },
}
