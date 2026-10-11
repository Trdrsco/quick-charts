import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'このフィードには出来高がありません',
  'host.saveConflict': '開いた後に別の場所で保存されています。保存する前に新しいバージョンを読み込んでください。',
  'host.saveNotFound': 'これは別の場所で削除されました。新規として保存し直してください。',
  'host.loadInvalid': '開けませんでした。画面の内容は変わっていません。',
  'host.loadUnavailable': '保存した作業にアクセスできませんでした。画面の内容は変わっていません。',
  'host.loadNotRestored': '開けず、画面にあった内容も元に戻せませんでした。保存済みのチャートまたはレイアウトを開くまで、チャートは保存されません。画面の内容を残すには、先にコピーを保存してください。',
  'host.notSaving': 'チャートは保存されていません。既知の状態から始めるには、保存済みのチャートまたはレイアウトを開いてください。コピーを保存すると画面の内容は残りますが、チャートは引き続き保存されません。',
}
