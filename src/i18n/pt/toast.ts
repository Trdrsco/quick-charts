import type { Translation } from '../runtime'
import type { toast as source } from '../en/toast'

export const toast: Translation<typeof source> = {
  'toast.dismiss': 'Dispensar',
  'toast.feedUnavailable': 'Sem dados de {symbol} neste feed.',
  'toast.feedNoData': 'Ainda sem dados de {symbol}.',
  'toast.imageCopyFallback': 'Não foi possível copiar a imagem. Um arquivo foi salvo no lugar.',
  'toast.imageFailed': 'Não foi possível capturar a imagem do gráfico.',
  'toast.indicatorsNotCarried': { one: '{count} indicador deste gráfico salvo não está disponível aqui e foi deixado de fora.', many: '{count} indicadores deste gráfico salvo não estão disponíveis aqui e foram deixados de fora.', other: '{count} indicadores deste gráfico salvo não estão disponíveis aqui e foram deixados de fora.' },
}
