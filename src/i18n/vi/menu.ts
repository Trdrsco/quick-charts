import type { Translation } from '@trdrs/i18n'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': 'Đặt lại khung nhìn biểu đồ',
  'menu.copyPrice': 'Sao chép giá {price}',
  'menu.paste': 'Dán',
  'menu.addAlert': 'Thêm cảnh báo cho {symbol} tại {price}…',
  'menu.addOrder': 'Thêm lệnh cho {symbol} tại {price}…',
  'menu.sellLimit': 'Bán {at} giới hạn',
  'menu.buyStop': 'Mua {at} dừng',
  'menu.buyLimit': 'Mua {at} giới hạn',
  'menu.sellStop': 'Bán {at} dừng',
  'menu.removeIndicators': { other: 'Xóa {count} chỉ báo' },
  'menu.removeDrawings': { other: 'Xóa {count} hình vẽ' },
  'menu.hideMarks': 'Ẩn dấu giao dịch trên nến',
  'menu.settings': 'Cài đặt…',
}
