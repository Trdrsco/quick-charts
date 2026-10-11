import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': '이 피드는 거래량을 제공하지 않습니다',
  'host.saveConflict': '연 이후 다른 곳에서 저장되었습니다. 저장하기 전에 최신 버전을 불러오세요.',
  'host.saveNotFound': '다른 곳에서 삭제되었습니다. 새 항목으로 다시 저장하세요.',
  'host.loadInvalid': '열 수 없습니다. 화면에는 변경된 것이 없습니다.',
  'host.loadUnavailable': '저장된 작업에 접근할 수 없습니다. 화면에는 변경된 것이 없습니다.',
  'host.loadNotRestored': '열 수 없었고, 화면에 있던 내용도 되돌릴 수 없었습니다. 저장된 차트나 레이아웃을 열 때까지 차트는 저장하지 않습니다. 화면의 내용을 유지하려면 먼저 사본을 저장하세요.',
  'host.notSaving': '차트가 저장하지 않고 있습니다. 알려진 상태에서 시작하려면 저장된 차트나 레이아웃을 여세요. 사본을 저장하면 화면의 내용은 유지되지만 차트는 계속 저장하지 않습니다.',
}
