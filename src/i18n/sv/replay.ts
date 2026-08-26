import type { Translation } from '@trdrs/i18n'
import type { replay as source } from '../en/replay'

export const replay: Translation<typeof source> = {
  'replay.stepBack': 'Gå tillbaka en stapel',
  'replay.play': 'Spela',
  'replay.pause': 'Pausa',
  'replay.stepForward': 'Gå fram en stapel',
  'replay.speed': 'Uppspelningshastighet (uppdateringar per sekund)',
  'replay.interval': 'Uppdateringsintervall (staplar byggs av finare verkliga staplar)',
  'replay.auto': 'Auto',
  'replay.goLive': 'Gå till live',
  'replay.goLiveTitle': 'Hoppa till livekanten',
  'replay.exit': 'Avsluta uppspelning',
}
