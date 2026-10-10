import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'Sem volume neste feed',
  'host.saveConflict': 'Salvo em outro lugar desde que você abriu. Carregue a versão mais recente antes de salvar.',
  'host.saveNotFound': 'Isto foi excluído em outro lugar. Salve novamente como novo.',
  'host.loadInvalid': 'Não foi possível abrir. Nada mudou na tela.',
  'host.loadUnavailable': 'Não foi possível acessar seu trabalho salvo. Nada mudou na tela.',
  'host.loadNotRestored': 'Não foi possível abrir, e o que estava na tela não pôde ser restaurado. O gráfico não salva até você abrir um gráfico ou layout salvo. Salve uma cópia antes para manter o que está na tela.',
  'host.notSaving': 'O gráfico não está salvando. Abra um gráfico ou layout salvo para começar de um estado conhecido. Salvar uma cópia mantém o que está na tela, mas o gráfico continuará sem salvar.',
}
