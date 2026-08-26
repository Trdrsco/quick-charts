import type { Translation } from '@trdrs/i18n'
import type { replay as source } from '../en/replay'

export const replay: Translation<typeof source> = {
  'replay.stepBack': '後退一根K線',
  'replay.play': '播放',
  'replay.pause': '暫停',
  'replay.stepForward': '前進一根K線',
  'replay.speed': '回放速度（每秒更新次數）',
  'replay.interval': '更新間隔（K線由更細的真實K線組成）',
  'replay.auto': '自動',
  'replay.goLive': '回到即時',
  'replay.goLiveTitle': '跳至即時行情',
  'replay.exit': '結束回放',
}
