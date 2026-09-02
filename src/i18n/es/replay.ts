import type { Translation } from '../runtime'
import type { replay as source } from '../en/replay'

export const replay: Translation<typeof source> = {
  'replay.stepBack': 'Retroceder una vela',
  'replay.play': 'Reproducir',
  'replay.pause': 'Pausar',
  'replay.stepForward': 'Avanzar una vela',
  'replay.speed': 'Velocidad de la repetición (actualizaciones por segundo)',
  'replay.interval': 'Intervalo de actualización (las velas se forman a partir de velas reales más finas)',
  'replay.auto': 'Auto',
  'replay.goLive': 'Ir a en vivo',
  'replay.goLiveTitle': 'Salta al borde en vivo',
  'replay.exit': 'Salir de la repetición',
}
