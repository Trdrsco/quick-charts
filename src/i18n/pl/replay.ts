import type { Translation } from '../runtime'
import type { replay as source } from '../en/replay'

export const replay: Translation<typeof source> = {
  'replay.stepBack': 'Cofnij o jeden słupek',
  'replay.play': 'Odtwórz',
  'replay.pause': 'Wstrzymaj',
  'replay.stepForward': 'Przejdź o jeden słupek do przodu',
  'replay.speed': 'Szybkość odtwarzania (aktualizacji na sekundę)',
  'replay.interval': 'Interwał aktualizacji (słupki powstają z dokładniejszych słupków rzeczywistych)',
  'replay.auto': 'Auto',
  'replay.goLive': 'Na żywo',
  'replay.goLiveTitle': 'Przejdź do krawędzi na żywo',
  'replay.exit': 'Zakończ odtwarzanie',
}
