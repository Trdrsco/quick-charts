import type { Translation } from '../runtime'
import type { timezone as source } from '../en/timezone'

export const timezone: Translation<typeof source> = {
  'timezone.title': 'אזור הזמן של הגרף',
  'timezone.tip': 'אזור זמן',
  'timezone.exchange': 'בורסה',
  'timezone.quarter': 'רבעון {quarter}',
}
