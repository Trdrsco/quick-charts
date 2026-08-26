import type { Translation } from '@trdrs/i18n'
import type { replay as source } from '../en/replay'

export const replay: Translation<typeof source> = {
  'replay.stepBack': 'Reculer d\'une barre',
  'replay.play': 'Lecture',
  'replay.pause': 'Pause',
  'replay.stepForward': 'Avancer d\'une barre',
  'replay.speed': 'Vitesse de relecture (mises à jour par seconde)',
  'replay.interval': 'Intervalle de mise à jour (les barres se forment à partir de barres réelles plus fines)',
  'replay.auto': 'Auto',
  'replay.goLive': 'Passer en direct',
  'replay.goLiveTitle': 'Aller au bord du direct',
  'replay.exit': 'Quitter la relecture',
}
