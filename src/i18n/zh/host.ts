import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': '此数据源不提供成交量',
  'host.saveConflict': '打开后已在其他位置保存过。保存前请先加载较新的版本。',
  'host.saveNotFound': '已在其他位置删除。请重新另存为新项目。',
  'host.loadInvalid': '无法打开。屏幕上的内容未发生变化。',
  'host.loadUnavailable': '无法访问已保存的工作。屏幕上的内容未发生变化。',
  'host.loadNotRestored': '无法打开，屏幕上原有的内容也无法恢复。在打开已保存的图表或布局之前，图表不会保存。如需保留屏幕上的内容，请先保存一份副本。',
  'host.notSaving': '图表未在保存。请打开已保存的图表或布局，从已知状态开始。保存副本可以保留屏幕上的内容，但图表仍不会保存。',
}
