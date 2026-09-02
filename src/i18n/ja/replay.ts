import type { Translation } from '../runtime'
import type { replay as source } from '../en/replay'

export const replay: Translation<typeof source> = {
  'replay.stepBack': '1バー戻る',
  'replay.play': '再生',
  'replay.pause': '一時停止',
  'replay.stepForward': '1バー進む',
  'replay.speed': 'リプレイ速度（1秒あたりの更新回数）',
  'replay.interval': '更新間隔（より細かい実バーからバーを形成）',
  'replay.auto': '自動',
  'replay.goLive': 'ライブへ',
  'replay.goLiveTitle': '最新のバーへ移動',
  'replay.exit': 'リプレイを終了',
}
