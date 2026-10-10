import type { Translation } from '../runtime'
import type { picker as source } from '../en/picker'

export const picker: Translation<typeof source> = {
  'picker.title': '지표',
  'picker.search': '지표 검색',
  'picker.noMatches': '일치하는 지표가 없습니다.',
  'picker.collections': '지표 컬렉션',
  'picker.personal': '개인',
  'picker.builtin': '기본 제공',
  'picker.favorites': '즐겨찾기',
  'picker.thousands': ' K',
  'picker.name': '이름',
  'picker.author': '작성자',
  'picker.favorite': '즐겨찾기에 {name} 추가',
  'picker.unfavorite': '즐겨찾기에서 {name} 제거',
  'picker.loading': '지표 불러오는 중…',
  'picker.unavailable': '지표 콘텐츠를 사용할 수 없습니다. 다시 시도하세요.',
  'picker.actionFailed': '작업을 완료할 수 없습니다. 다시 시도하세요.',
  'picker.add': '{name} 추가',
  'picker.notPermitted': '{name}은(는) 여기에서 사용할 수 없습니다',
}
