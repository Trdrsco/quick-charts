import type { Translation } from '../runtime'
import type { picker as source } from '../en/picker'

export const picker: Translation<typeof source> = {
  'picker.title': 'インジケーター',
  'picker.search': 'インジケーターを検索',
  'picker.noMatches': '一致するインジケーターはありません。',
  'picker.collections': 'インジケーターのコレクション',
  'picker.personal': '個人用',
  'picker.builtin': '組み込み',
  'picker.favorites': 'お気に入り',
  'picker.thousands': ' K',
  'picker.name': '名前',
  'picker.author': '作成者',
  'picker.favorite': '{name}をお気に入りに追加',
  'picker.unfavorite': '{name}をお気に入りから削除',
  'picker.loading': 'インジケーターを読み込み中…',
  'picker.unavailable': 'インジケーターのコンテンツを利用できません。もう一度お試しください。',
  'picker.actionFailed': '操作を完了できませんでした。もう一度お試しください。',
  'picker.add': '{name}を追加',
  'picker.notPermitted': '{name}はここでは利用できません',
}
