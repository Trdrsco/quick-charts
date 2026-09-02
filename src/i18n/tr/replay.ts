import type { Translation } from '../runtime'
import type { replay as source } from '../en/replay'

export const replay: Translation<typeof source> = {
  'replay.stepBack': 'Bir bar geri git',
  'replay.play': 'Oynat',
  'replay.pause': 'Duraklat',
  'replay.stepForward': 'Bir bar ileri git',
  'replay.speed': 'Tekrar oynatma hızı (saniyedeki güncelleme)',
  'replay.interval': 'Güncelleme aralığı (barlar daha küçük gerçek barlardan oluşur)',
  'replay.auto': 'Otomatik',
  'replay.goLive': 'Canlıya geç',
  'replay.goLiveTitle': 'Canlı uca atla',
  'replay.exit': 'Tekrar oynatmadan çık',
}
