import type { Translation } from '../runtime'
import type { broker as source } from '../en/broker'

export const broker: Translation<typeof source> = {
  'broker.positionAlreadyClosed': 'Pozisyon zaten kapatıldı',
  'broker.orderNotWorking': 'Emir artık beklemede değil',
  'broker.tickUnknownReprice': 'Tick büyüklüğü bilinmiyor, yeniden fiyatlandırılamaz',
  'broker.pricesUnknownReprice': 'Emir fiyatları bilinmiyor, yeniden fiyatlandırılamaz',
  'broker.noLimitBand': 'Bant için geçerli bir limit fiyatı yok',
  'broker.noStopBand': 'Bant için geçerli bir stop fiyatı yok',
  'broker.noStopAnchor': 'Stop için dayanak alınacak fiyat yok',
  'broker.tickUnknown': 'Tick büyüklüğü bilinmiyor',
  'broker.noAnchor': 'Dayanak yok',
  'broker.takeProfitAbove': 'Kâr al girişin üzerinde olmalı',
  'broker.takeProfitBelow': 'Kâr al girişin altında olmalı',
  'broker.positionClosed': 'Pozisyon kapatıldı',
  'broker.orderCancelled': 'Emir iptal edildi',
  'broker.targetMoved': 'Hedef {price} seviyesine taşındı',
  'broker.orderMoved': 'Emir {price} seviyesine taşındı',
  'broker.triggerMoved': 'Tetik {price} seviyesine taşındı',
  'broker.limitMoved': 'Limit {price} seviyesine taşındı',
  'broker.stopMoved': 'Stop {price} seviyesine taşındı',
  'broker.stopSideUnverified': 'Canlı fiyat yok, stop yönü doğrulanmadı',
}
