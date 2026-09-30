import type { Translation } from '../runtime'
import type { toast as source } from '../en/toast'

export const toast: Translation<typeof source> = {
  'toast.dismiss': 'Dismiss',
  'toast.feedUnavailable': 'No data for {symbol} from this feed.',
  'toast.feedNoData': 'No data for {symbol} yet.',
  'toast.imageCopyFallback': 'Could not copy the image. Saved a file instead.',
  'toast.imageFailed': 'Could not capture the chart image.',
  'toast.indicatorsNotCarried': { zero: '{count} indicators in this saved chart are not available here and were left out.', one: '{count} indicator in this saved chart is not available here and was left out.', two: '{count} indicators in this saved chart are not available here and were left out.', few: '{count} indicators in this saved chart are not available here and were left out.', many: '{count} indicators in this saved chart are not available here and were left out.', other: '{count} indicators in this saved chart are not available here and were left out.' },
}
