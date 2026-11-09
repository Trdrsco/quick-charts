import type { Translation } from '../runtime'
import type { timezone as source } from '../en/timezone'

export const timezone: Translation<typeof source> = {
  'timezone.title': 'Zona horaria del gráfico',
  'timezone.tip': 'Zona horaria',
  'timezone.exchange': 'Mercado',
  'timezone.quarter': 'T{quarter}',
}
