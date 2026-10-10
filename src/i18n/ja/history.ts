import type { Translation } from '../runtime'
import type { history as source } from '../en/history'

export const history: Translation<typeof source> = {
  'history.undoNamed': '元に戻す：{change}',
  'history.redoNamed': 'やり直す：{change}',
  'history.changeSymbol': '銘柄の変更',
  'history.changeTimeframe': '時間足の変更',
  'history.changeChartStyle': 'チャートスタイルの変更',
  'history.changePriceScale': '価格スケールの変更',
  'history.changeSettings': '設定の変更',
  'history.changeAddCompare': '比較の追加',
  'history.changeRemoveCompare': '比較の削除',
  'history.changeCompare': '比較の変更',
  'history.changeAddIndicator': 'インジケーターの追加',
  'history.changeRemoveIndicator': 'インジケーターの削除',
  'history.changeIndicator': 'インジケーターの変更',
  'history.changeMovePane': 'move pane',
  'history.changeAddDrawing': '描画の追加',
  'history.changeRemoveDrawing': '描画の削除',
  'history.changeDrawing': '描画の変更',
}
