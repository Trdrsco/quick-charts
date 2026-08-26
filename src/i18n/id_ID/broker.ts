import type { Translation } from '@trdrs/i18n'
import type { broker as source } from '../en/broker'

export const broker: Translation<typeof source> = {
  'broker.positionAlreadyClosed': 'Posisi sudah ditutup',
  'broker.orderNotWorking': 'Order tidak lagi aktif',
  'broker.tickUnknownReprice': 'Ukuran tick tidak diketahui, harga tidak dapat diubah',
  'broker.pricesUnknownReprice': 'Harga order tidak diketahui, harga tidak dapat diubah',
  'broker.noLimitBand': 'Tidak ada harga limit saat ini sebagai acuan batas',
  'broker.noStopBand': 'Tidak ada harga stop saat ini sebagai acuan batas',
  'broker.noStopAnchor': 'Tidak ada harga untuk mengaitkan stop',
  'broker.tickUnknown': 'Ukuran tick tidak diketahui',
  'broker.noAnchor': 'Tidak ada acuan',
  'broker.takeProfitAbove': 'Take profit harus di atas harga masuk',
  'broker.takeProfitBelow': 'Take profit harus di bawah harga masuk',
  'broker.positionClosed': 'Posisi ditutup',
  'broker.orderCancelled': 'Order dibatalkan',
  'broker.targetMoved': 'Target dipindahkan ke {price}',
  'broker.orderMoved': 'Order dipindahkan ke {price}',
  'broker.triggerMoved': 'Pemicu dipindahkan ke {price}',
  'broker.limitMoved': 'Limit dipindahkan ke {price}',
  'broker.stopMoved': 'Stop dipindahkan ke {price}',
  'broker.stopSideUnverified': 'Tidak ada harga live, sisi stop belum terverifikasi',
}
