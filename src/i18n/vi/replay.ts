import type { Translation } from '../runtime'
import type { replay as source } from '../en/replay'

export const replay: Translation<typeof source> = {
  'replay.stepBack': 'Lùi một nến',
  'replay.play': 'Phát',
  'replay.pause': 'Tạm dừng',
  'replay.stepForward': 'Tiến một nến',
  'replay.speed': 'Tốc độ phát lại (số lần cập nhật mỗi giây)',
  'replay.interval': 'Khoảng cập nhật (nến được dựng từ nến thật nhỏ hơn)',
  'replay.auto': 'Tự động',
  'replay.goLive': 'Về thời gian thực',
  'replay.goLiveTitle': 'Nhảy tới nến hiện tại',
  'replay.exit': 'Thoát phát lại',
}
