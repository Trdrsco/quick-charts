import type { Translation } from '../runtime'
import type { timezone as source } from '../en/timezone'

export const timezone: Translation<typeof source> = {
  'timezone.title': 'Fuso horário do gráfico',
  'timezone.tip': 'Fuso horário',
  'timezone.exchange': 'Bolsa',
  'timezone.quarter': '{quarter}T',
}
