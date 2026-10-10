import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'Nessun volume da questo feed',
  'host.saveConflict': 'Salvato altrove dopo l\'apertura. Carica la versione più recente prima di salvare.',
  'host.saveNotFound': 'È stato eliminato altrove. Salvalo di nuovo come nuovo.',
  'host.loadInvalid': 'Impossibile aprirlo. Sullo schermo non è cambiato nulla.',
  'host.loadUnavailable': 'Impossibile raggiungere il lavoro salvato. Sullo schermo non è cambiato nulla.',
  'host.loadNotRestored': 'Impossibile aprirlo, e non è stato possibile ripristinare ciò che era sullo schermo. Il grafico non salva finché non apri un grafico o un layout salvato. Salva prima una copia per conservare ciò che è sullo schermo.',
  'host.notSaving': 'Il grafico non sta salvando. Apri un grafico o un layout salvato per ripartire da uno stato noto. Salvare una copia conserva ciò che è sullo schermo, ma il grafico continuerà a non salvare.',
}
