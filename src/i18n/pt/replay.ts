import type { Translation } from '@trdrs/i18n'
import type { replay as source } from '../en/replay'

export const replay: Translation<typeof source> = {
  'replay.stepBack': 'Voltar um candle',
  'replay.play': 'Reproduzir',
  'replay.pause': 'Pausar',
  'replay.stepForward': 'Avançar um candle',
  'replay.speed': 'Velocidade do replay (atualizações por segundo)',
  'replay.interval': 'Intervalo de atualização (os candles se formam a partir de candles reais menores)',
  'replay.auto': 'Auto',
  'replay.goLive': 'Ao vivo',
  'replay.goLiveTitle': 'Ir para o candle em tempo real',
  'replay.exit': 'Sair do replay',
}
