import type { Translation } from '../runtime'
import type { broker as source } from '../en/broker'

export const broker: Translation<typeof source> = {
  'broker.positionAlreadyClosed': 'Posisi sudah ditutup',
  'broker.orderNotWorking': 'Pesanan tidak lagi aktif',
  'broker.tickUnknownReprice': 'Saiz tick tidak diketahui, harga tidak dapat diubah',
  'broker.pricesUnknownReprice': 'Harga pesanan tidak diketahui, harga tidak dapat diubah',
  'broker.noLimitBand': 'Tiada harga limit semasa untuk dijadikan rujukan jalur',
  'broker.noStopBand': 'Tiada harga henti semasa untuk dijadikan rujukan jalur',
  'broker.noStopAnchor': 'Tiada harga untuk menambat henti',
  'broker.tickUnknown': 'Saiz tick tidak diketahui',
  'broker.noAnchor': 'Tiada tambatan',
  'broker.takeProfitAbove': 'Ambil untung mesti di atas harga masuk',
  'broker.takeProfitBelow': 'Ambil untung mesti di bawah harga masuk',
  'broker.positionClosed': 'Posisi ditutup',
  'broker.orderCancelled': 'Pesanan dibatalkan',
  'broker.targetMoved': 'Sasaran dialih ke {price}',
  'broker.orderMoved': 'Pesanan dialih ke {price}',
  'broker.triggerMoved': 'Pemicu dialih ke {price}',
  'broker.limitMoved': 'Limit dialih ke {price}',
  'broker.stopMoved': 'Henti dialih ke {price}',
  'broker.stopSideUnverified': 'Tiada harga langsung, arah henti belum disahkan',
}
