import type { Translation } from '../runtime'
import type { timezone as source } from '../en/timezone'

export const timezone: Translation<typeof source> = {
  'timezone.title': 'Zon waktu carta',
  'timezone.tip': 'Zon waktu',
  'timezone.exchange': 'Bursa',
  'timezone.quarter': 'S{quarter}',
}
