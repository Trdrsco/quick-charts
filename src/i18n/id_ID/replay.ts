import type { Translation } from '@trdrs/i18n'
import type { replay as source } from '../en/replay'

export const replay: Translation<typeof source> = {
  'replay.stepBack': 'Mundur satu bar',
  'replay.play': 'Putar',
  'replay.pause': 'Jeda',
  'replay.stepForward': 'Maju satu bar',
  'replay.speed': 'Kecepatan pemutaran ulang (pembaruan per detik)',
  'replay.interval': 'Interval pembaruan (bar terbentuk dari bar riil yang lebih halus)',
  'replay.auto': 'Otomatis',
  'replay.goLive': 'Ke live',
  'replay.goLiveTitle': 'Lompat ke tepi live',
  'replay.exit': 'Keluar dari pemutaran ulang',
}
