import type { Translation } from '../runtime'
import type { replay as source } from '../en/replay'

export const replay: Translation<typeof source> = {
  'replay.stepBack': 'Indietro di una barra',
  'replay.play': 'Avvia',
  'replay.pause': 'Pausa',
  'replay.stepForward': 'Avanti di una barra',
  'replay.speed': 'Velocità del replay (aggiornamenti al secondo)',
  'replay.interval': 'Intervallo di aggiornamento (le barre si formano da barre reali più fini)',
  'replay.auto': 'Auto',
  'replay.goLive': 'Vai al live',
  'replay.goLiveTitle': 'Salta al bordo live',
  'replay.exit': 'Esci dal replay',
}
