import type { Translation } from '../runtime'
import type { history as source } from '../en/history'

export const history: Translation<typeof source> = {
  'history.undoNamed': 'เลิกทำ: {change}',
  'history.redoNamed': 'ทำซ้ำ: {change}',
  'history.changeSymbol': 'การเปลี่ยนสัญลักษณ์',
  'history.changeTimeframe': 'การเปลี่ยนกรอบเวลา',
  'history.changeChartStyle': 'การเปลี่ยนรูปแบบกราฟ',
  'history.changePriceScale': 'การเปลี่ยนสเกลราคา',
  'history.changeSettings': 'การเปลี่ยนการตั้งค่า',
  'history.changeAddCompare': 'การเพิ่มการเปรียบเทียบ',
  'history.changeRemoveCompare': 'การนำการเปรียบเทียบออก',
  'history.changeCompare': 'การเปลี่ยนการเปรียบเทียบ',
  'history.changeAddIndicator': 'การเพิ่มอินดิเคเตอร์',
  'history.changeRemoveIndicator': 'การนำอินดิเคเตอร์ออก',
  'history.changeIndicator': 'การเปลี่ยนอินดิเคเตอร์',
  'history.changeMovePane': 'move pane',
  'history.changeAddDrawing': 'การเพิ่มการวาด',
  'history.changeRemoveDrawing': 'การนำการวาดออก',
  'history.changeDrawing': 'การเปลี่ยนการวาด',
}
