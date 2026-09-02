import type { Translation } from '../runtime'
import type { replay as source } from '../en/replay'

export const replay: Translation<typeof source> = {
  'replay.stepBack': 'Einen Balken zurück',
  'replay.play': 'Abspielen',
  'replay.pause': 'Pause',
  'replay.stepForward': 'Einen Balken vor',
  'replay.speed': 'Wiedergabegeschwindigkeit (Updates pro Sekunde)',
  'replay.interval': 'Update-Intervall (Balken entstehen aus feineren echten Balken)',
  'replay.auto': 'Auto',
  'replay.goLive': 'Live gehen',
  'replay.goLiveTitle': 'Zum Live-Rand springen',
  'replay.exit': 'Wiedergabe beenden',
}
