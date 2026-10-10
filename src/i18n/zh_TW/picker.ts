import type { Translation } from '../runtime'
import type { picker as source } from '../en/picker'

export const picker: Translation<typeof source> = {
  'picker.title': '指標',
  'picker.search': '搜尋指標',
  'picker.noMatches': '沒有相符的指標。',
  'picker.collections': '指標集合',
  'picker.personal': '個人',
  'picker.builtin': '內建',
  'picker.favorites': '我的最愛',
  'picker.thousands': ' K',
  'picker.name': '名稱',
  'picker.author': '作者',
  'picker.favorite': '將{name}加入我的最愛',
  'picker.unfavorite': '從我的最愛移除{name}',
  'picker.loading': '正在載入指標…',
  'picker.unavailable': '無法使用指標內容。請再試一次。',
  'picker.actionFailed': '無法完成此動作。請再試一次。',
  'picker.add': '新增{name}',
  'picker.notPermitted': '{name}在此無法使用',
}
