import type { Translation } from '../runtime'
import type { timezone as source } from '../en/timezone'

export const timezone: Translation<typeof source> = {
  'timezone.title': 'Zona waktu chart',
  'timezone.tip': 'Zona waktu',
  'timezone.exchange': 'Bursa',
  'timezone.quarter': 'K{quarter}',
}
