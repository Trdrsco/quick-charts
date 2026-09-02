import type { Translation } from '../runtime'
import type { replay as source } from '../en/replay'

export const replay: Translation<typeof source> = {
  'replay.stepBack': 'Retrocedeix una barra',
  'replay.play': 'Reprodueix',
  'replay.pause': 'Pausa',
  'replay.stepForward': 'Avança una barra',
  'replay.speed': 'Velocitat de repetició (actualitzacions per segon)',
  'replay.interval': 'Interval d’actualització (les barres es formen a partir de barres reals més fines)',
  'replay.auto': 'Automàtic',
  'replay.goLive': 'Vés al directe',
  'replay.goLiveTitle': 'Salta a l’extrem en directe',
  'replay.exit': 'Surt de la repetició',
}
