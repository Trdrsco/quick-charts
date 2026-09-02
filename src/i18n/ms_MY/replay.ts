import type { Translation } from '../runtime'
import type { replay as source } from '../en/replay'

export const replay: Translation<typeof source> = {
  'replay.stepBack': 'Langkah ke belakang satu bar',
  'replay.play': 'Main',
  'replay.pause': 'Henti sementara',
  'replay.stepForward': 'Langkah ke hadapan satu bar',
  'replay.speed': 'Kelajuan main semula (kemas kini setiap saat)',
  'replay.interval': 'Selang kemas kini (bar terbentuk daripada bar sebenar yang lebih halus)',
  'replay.auto': 'Auto',
  'replay.goLive': 'Ke data langsung',
  'replay.goLiveTitle': 'Lompat ke hujung data langsung',
  'replay.exit': 'Keluar main semula',
}
