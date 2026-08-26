import type { Translation } from '@trdrs/i18n'
import type { replay as source } from '../en/replay'

export const replay: Translation<typeof source> = {
  'replay.stepBack': 'Step back one bar',
  'replay.play': 'Play',
  'replay.pause': 'Pause',
  'replay.stepForward': 'Step forward one bar',
  'replay.speed': 'Replay speed (updates per second)',
  'replay.interval': 'Update interval (bars form from finer real bars)',
  'replay.auto': 'Auto',
  'replay.goLive': 'Go live',
  'replay.goLiveTitle': 'Jump to the live edge',
  'replay.exit': 'Exit replay',
}
