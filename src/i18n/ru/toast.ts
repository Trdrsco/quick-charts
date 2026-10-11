import type { Translation } from '../runtime'
import type { toast as source } from '../en/toast'

export const toast: Translation<typeof source> = {
  'toast.dismiss': 'Закрыть',
  'toast.feedUnavailable': 'Нет данных по {symbol} из этого источника.',
  'toast.feedNoData': 'Данных по {symbol} пока нет.',
  'toast.imageCopyFallback': 'Не удалось скопировать изображение. Вместо этого сохранен файл.',
  'toast.imageFailed': 'Не удалось сделать снимок графика.',
  'toast.indicatorsNotCarried': { one: '{count} индикатор из этого сохраненного графика здесь недоступен и был пропущен.', few: '{count} индикатора из этого сохраненного графика здесь недоступны и были пропущены.', many: '{count} индикаторов из этого сохраненного графика здесь недоступны и были пропущены.', other: '{count} индикатора из этого сохраненного графика здесь недоступны и были пропущены.' },
}
