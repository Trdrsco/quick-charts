import type { Translation } from '../runtime'
import type { picker as source } from '../en/picker'

export const picker: Translation<typeof source> = {
  'picker.title': '指标',
  'picker.search': '搜索指标',
  'picker.noMatches': '没有匹配的指标。',
  'picker.collections': '指标集合',
  'picker.personal': '个人',
  'picker.builtin': '内置',
  'picker.favorites': '收藏',
  'picker.thousands': ' K',
  'picker.name': '名称',
  'picker.author': '作者',
  'picker.favorite': '收藏{name}',
  'picker.unfavorite': '取消收藏{name}',
  'picker.loading': '正在加载指标…',
  'picker.unavailable': '指标内容不可用。请重试。',
  'picker.actionFailed': '无法完成该操作。请重试。',
  'picker.add': '添加{name}',
  'picker.notPermitted': '{name}在此不可用',
}
