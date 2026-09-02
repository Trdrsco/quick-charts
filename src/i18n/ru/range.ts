import type { Translation } from '../runtime'
import type { range as source } from '../en/range'

export const range: Translation<typeof source> = {
  'range.oneDay': '1 день',
  'range.fiveDays': '5 дней',
  'range.oneMonth': '1 месяц',
  'range.threeMonths': '3 месяца',
  'range.sixMonths': '6 месяцев',
  'range.yearToDate': 'С начала года',
  'range.oneYear': '1 год',
  'range.fiveYears': '5 лет',
  'range.all': 'Все данные',
  'range.tip': '{range} · бары {interval}',
  'range.zoomIn': 'Приблизить',
  'range.zoomOut': 'Отдалить',
  'range.scrollLeft': 'Прокрутить влево',
  'range.scrollRight': 'Прокрутить вправо',
  'range.reset': 'Сбросить вид графика',
}
