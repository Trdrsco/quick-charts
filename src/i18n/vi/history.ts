import type { Translation } from '../runtime'
import type { history as source } from '../en/history'

export const history: Translation<typeof source> = {
  'history.undoNamed': 'Hoàn tác: {change}',
  'history.redoNamed': 'Làm lại: {change}',
  'history.changeSymbol': 'thay đổi mã',
  'history.changeTimeframe': 'thay đổi khung thời gian',
  'history.changeChartStyle': 'thay đổi kiểu biểu đồ',
  'history.changePriceScale': 'thay đổi thang giá',
  'history.changeSettings': 'thay đổi cài đặt',
  'history.changeAddCompare': 'thêm so sánh',
  'history.changeRemoveCompare': 'xóa so sánh',
  'history.changeCompare': 'thay đổi so sánh',
  'history.changeAddIndicator': 'thêm chỉ báo',
  'history.changeRemoveIndicator': 'xóa chỉ báo',
  'history.changeIndicator': 'thay đổi chỉ báo',
  'history.changeMovePane': 'move pane',
  'history.changeAddDrawing': 'thêm hình vẽ',
  'history.changeRemoveDrawing': 'xóa hình vẽ',
  'history.changeDrawing': 'thay đổi hình vẽ',
}
