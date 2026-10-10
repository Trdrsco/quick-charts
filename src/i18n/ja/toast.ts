import type { Translation } from '../runtime'
import type { toast as source } from '../en/toast'

export const toast: Translation<typeof source> = {
  'toast.dismiss': '閉じる',
  'toast.feedUnavailable': 'このフィードには{symbol}のデータがありません。',
  'toast.feedNoData': '{symbol}のデータはまだありません。',
  'toast.imageCopyFallback': '画像をコピーできませんでした。代わりにファイルを保存しました。',
  'toast.imageFailed': 'チャート画像をキャプチャできませんでした。',
  'toast.indicatorsNotCarried': { other: 'この保存済みチャートのインジケーター{count}件はここでは利用できないため、除外されました。' },
}
