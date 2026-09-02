import type { Translation } from '../runtime'
import type { search as source } from '../en/search'

export const search: Translation<typeof source> = {
  'search.title': '심볼 검색',
  'search.compareTitle': '심볼 비교',
  'search.changeSymbolTitle': '심볼 변경',
  'search.placeholder': 'Search symbol',
  'search.clear': '지우기',
  'search.noMatches': '일치하는 심볼이 없습니다.',
  'search.loadingMore': '더 불러오는 중…',
  'search.failed': 'Search failed.',
  'search.samePercent': '같은 % 스케일',
  'search.newScale': '새 가격 스케일',
  'search.newPane': '새 패널',
  'search.added': '추가된 심볼',
  'search.recent': '최근 심볼',
  'search.addedMark': '{symbol}은(는) 차트에 있습니다. 클릭하면 제거됩니다.',
  'search.compareEmpty': 'No symbols here yet. Why not add some?',
  'search.opDivision': '나눗셈',
  'search.opSubtraction': '뺄셈',
  'search.opAddition': '덧셈',
  'search.opMultiplication': '곱셈',
  'search.opExponentiation': '거듭제곱',
  'search.opReciprocal': '역수',
  'search.opsHide': '스프레드 연산자 숨기기',
  'search.opsShow': '스프레드 연산자 표시',
}
