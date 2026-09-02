import type { Translation } from '../runtime'
import type { search as source } from '../en/search'

export const search: Translation<typeof source> = {
  'search.title': '代码搜索',
  'search.compareTitle': '比较代码',
  'search.changeSymbolTitle': '更改代码',
  'search.placeholder': 'Search symbol',
  'search.clear': '清除',
  'search.noMatches': '没有匹配的代码。',
  'search.loadingMore': '加载更多…',
  'search.failed': 'Search failed.',
  'search.samePercent': '相同%刻度',
  'search.newScale': '新价格刻度',
  'search.newPane': '新窗格',
  'search.added': '已添加代码',
  'search.recent': '最近代码',
  'search.addedMark': '{symbol}已在图表上。点击移除。',
  'search.compareEmpty': 'No symbols here yet. Why not add some?',
  'search.opDivision': '除法',
  'search.opSubtraction': '减法',
  'search.opAddition': '加法',
  'search.opMultiplication': '乘法',
  'search.opExponentiation': '幂运算',
  'search.opReciprocal': '倒数',
  'search.opsHide': '隐藏价差运算符',
  'search.opsShow': '显示价差运算符',
}
