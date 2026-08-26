import type { Translation } from '@trdrs/i18n'
import type { broker as source } from '../en/broker'

export const broker: Translation<typeof source> = {
  'broker.positionAlreadyClosed': 'Vị thế đã được đóng',
  'broker.orderNotWorking': 'Lệnh không còn hiệu lực',
  'broker.tickUnknownReprice': 'Không rõ bước giá, không thể đổi giá',
  'broker.pricesUnknownReprice': 'Không rõ giá của lệnh, không thể đổi giá',
  'broker.noLimitBand': 'Không có giá giới hạn hiện tại để giới hạn biên',
  'broker.noStopBand': 'Không có giá dừng hiện tại để giới hạn biên',
  'broker.noStopAnchor': 'Không có giá để neo lệnh dừng',
  'broker.tickUnknown': 'Không rõ bước giá',
  'broker.noAnchor': 'Không có điểm neo',
  'broker.takeProfitAbove': 'Chốt lời phải nằm trên giá vào',
  'broker.takeProfitBelow': 'Chốt lời phải nằm dưới giá vào',
  'broker.positionClosed': 'Đã đóng vị thế',
  'broker.orderCancelled': 'Đã hủy lệnh',
  'broker.targetMoved': 'Đã chuyển mục tiêu sang {price}',
  'broker.orderMoved': 'Đã chuyển lệnh sang {price}',
  'broker.triggerMoved': 'Đã chuyển giá kích hoạt sang {price}',
  'broker.limitMoved': 'Đã chuyển giá giới hạn sang {price}',
  'broker.stopMoved': 'Đã chuyển giá dừng sang {price}',
  'broker.stopSideUnverified': 'Không có giá trực tiếp, chưa xác minh được chiều của lệnh dừng',
}
