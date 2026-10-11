import type { Translation } from '../runtime'
import type { toast as source } from '../en/toast'

export const toast: Translation<typeof source> = {
  'toast.dismiss': '关闭',
  'toast.feedUnavailable': '此数据源没有{symbol}的数据。',
  'toast.feedNoData': '暂无{symbol}的数据。',
  'toast.imageCopyFallback': '无法复制图片，已改为保存文件。',
  'toast.imageFailed': '无法截取图表图片。',
  'toast.indicatorsNotCarried': { other: '此已保存图表中有{count}个指标在这里不可用，已被省略。' },
}
