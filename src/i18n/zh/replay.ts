import type { Translation } from '../runtime'
import type { replay as source } from '../en/replay'

export const replay: Translation<typeof source> = {
  'replay.stepBack': '后退一根K线',
  'replay.play': '播放',
  'replay.pause': '暂停',
  'replay.stepForward': '前进一根K线',
  'replay.speed': '回放速度（每秒更新次数）',
  'replay.interval': '更新间隔（由更细的真实K线合成）',
  'replay.auto': '自动',
  'replay.goLive': '回到实时',
  'replay.goLiveTitle': '跳至最新行情',
  'replay.exit': '退出回放',
}
