import type { Translation } from '../runtime'
import type { replay as source } from '../en/replay'

export const replay: Translation<typeof source> = {
  'replay.stepBack': 'Шаг назад на один бар',
  'replay.play': 'Пуск',
  'replay.pause': 'Пауза',
  'replay.stepForward': 'Шаг вперед на один бар',
  'replay.speed': 'Скорость воспроизведения (обновлений в секунду)',
  'replay.interval': 'Интервал обновления (бары складываются из реальных более мелких баров)',
  'replay.auto': 'Авто',
  'replay.goLive': 'К реальному времени',
  'replay.goLiveTitle': 'Перейти к текущему бару',
  'replay.exit': 'Выйти из воспроизведения',
}
