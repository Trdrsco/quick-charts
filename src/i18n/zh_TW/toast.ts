import type { Translation } from '../runtime'
import type { toast as source } from '../en/toast'

export const toast: Translation<typeof source> = {
  'toast.dismiss': '關閉',
  'toast.feedUnavailable': '此資料來源沒有{symbol}的資料。',
  'toast.feedNoData': '目前還沒有{symbol}的資料。',
  'toast.imageCopyFallback': '無法複製圖片，已改為儲存檔案。',
  'toast.imageFailed': '無法擷取圖表圖片。',
  'toast.indicatorsNotCarried': { other: '此已儲存圖表中有{count}個指標在這裡無法使用，已略過。' },
}
