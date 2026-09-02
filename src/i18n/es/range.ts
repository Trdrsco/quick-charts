import type { Translation } from '../runtime'
import type { range as source } from '../en/range'

export const range: Translation<typeof source> = {
  'range.oneDay': '1 día',
  'range.fiveDays': '5 días',
  'range.oneMonth': '1 mes',
  'range.threeMonths': '3 meses',
  'range.sixMonths': '6 meses',
  'range.yearToDate': 'Año en curso',
  'range.oneYear': '1 año',
  'range.fiveYears': '5 años',
  'range.all': 'Todos los datos',
  'range.tip': '{range} · velas de {interval}',
  'range.zoomIn': 'Acercar',
  'range.zoomOut': 'Alejar',
  'range.scrollLeft': 'Desplazar a la izquierda',
  'range.scrollRight': 'Desplazar a la derecha',
  'range.reset': 'Restablecer la vista del gráfico',
}
