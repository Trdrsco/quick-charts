import type { Translation } from '@trdrs/i18n'
import type { replay as source } from '../en/replay'

export const replay: Translation<typeof source> = {
  'replay.stepBack': '한 바 뒤로',
  'replay.play': '재생',
  'replay.pause': '일시정지',
  'replay.stepForward': '한 바 앞으로',
  'replay.speed': '리플레이 속도 (초당 업데이트 횟수)',
  'replay.interval': '업데이트 간격 (더 작은 실제 바로 바를 구성)',
  'replay.auto': '자동',
  'replay.goLive': '실시간',
  'replay.goLiveTitle': '실시간 지점으로 이동',
  'replay.exit': '리플레이 종료',
}
