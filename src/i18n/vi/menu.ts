import type { Translation } from '../runtime'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': 'Đặt lại khung nhìn biểu đồ',
  'menu.copyPrice': 'Sao chép giá {price}',
  'menu.paste': 'Dán',
  'menu.removeIndicators': { other: 'Xóa {count} chỉ báo' },
  'menu.removeDrawings': { other: 'Xóa {count} hình vẽ' },
  'menu.settings': 'Cài đặt…',
}
