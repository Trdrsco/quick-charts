import type { Translation } from '../runtime'
import type { picker as source } from '../en/picker'

export const picker: Translation<typeof source> = {
  'picker.title': 'Indicadores',
  'picker.search': 'Pesquisar indicadores',
  'picker.noMatches': 'Nenhum indicador correspondente.',
  'picker.collections': 'Coleções de indicadores',
  'picker.personal': 'Pessoais',
  'picker.builtin': 'Integrados',
  'picker.favorites': 'Favoritos',
  'picker.thousands': ' K',
  'picker.name': 'Nome',
  'picker.author': 'Autor',
  'picker.favorite': 'Adicionar {name} aos favoritos',
  'picker.unfavorite': 'Remover {name} dos favoritos',
  'picker.loading': 'Carregando indicadores…',
  'picker.unavailable': 'O conteúdo dos indicadores não está disponível. Tente novamente.',
  'picker.actionFailed': 'Não foi possível concluir a ação. Tente novamente.',
  'picker.add': 'Adicionar {name}',
  'picker.notPermitted': '{name} não está disponível aqui',
}
