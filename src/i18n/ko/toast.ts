import type { Translation } from '../runtime'
import type { toast as source } from '../en/toast'

export const toast: Translation<typeof source> = {
  'toast.dismiss': '닫기',
  'toast.feedUnavailable': '이 피드에는 {symbol} 데이터가 없습니다.',
  'toast.feedNoData': '아직 {symbol} 데이터가 없습니다.',
  'toast.imageCopyFallback': '이미지를 복사할 수 없어 대신 파일로 저장했습니다.',
  'toast.imageFailed': '차트 이미지를 캡처할 수 없습니다.',
  'toast.indicatorsNotCarried': { other: '저장된 차트의 지표 {count}개는 여기에서 사용할 수 없어 제외되었습니다.' },
}
