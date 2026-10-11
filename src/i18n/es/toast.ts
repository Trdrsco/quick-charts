import type { Translation } from '../runtime'
import type { toast as source } from '../en/toast'

export const toast: Translation<typeof source> = {
  'toast.dismiss': 'Descartar',
  'toast.feedUnavailable': 'No hay datos de {symbol} en esta fuente.',
  'toast.feedNoData': 'Aún no hay datos de {symbol}.',
  'toast.imageCopyFallback': 'No se pudo copiar la imagen. Se ha guardado un archivo en su lugar.',
  'toast.imageFailed': 'No se pudo capturar la imagen del gráfico.',
  'toast.indicatorsNotCarried': { one: '{count} indicador de este gráfico guardado no está disponible aquí y se ha omitido.', many: '{count} indicadores de este gráfico guardado no están disponibles aquí y se han omitido.', other: '{count} indicadores de este gráfico guardado no están disponibles aquí y se han omitido.' },
}
