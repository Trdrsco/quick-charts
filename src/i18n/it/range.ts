import type { Translation } from '../runtime'
import type { range as source } from '../en/range'

export const range: Translation<typeof source> = {
  'range.oneDay': '1 giorno',
  'range.fiveDays': '5 giorni',
  'range.oneMonth': '1 mese',
  'range.threeMonths': '3 mesi',
  'range.sixMonths': '6 mesi',
  'range.yearToDate': 'Da inizio anno',
  'range.oneYear': '1 anno',
  'range.fiveYears': '5 anni',
  'range.all': 'Tutti i dati',
  'range.tip': '{range} · barre da {interval}',
  'range.zoomIn': 'Ingrandisci',
  'range.zoomOut': 'Riduci',
  'range.scrollLeft': 'Scorri a sinistra',
  'range.scrollRight': 'Scorri a destra',
  'range.reset': 'Ripristina la vista del grafico',
}
