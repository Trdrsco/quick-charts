import type { Translation } from '../runtime'
import type { toast as source } from '../en/toast'

export const toast: Translation<typeof source> = {
  'toast.dismiss': 'Kapat',
  'toast.feedUnavailable': 'Bu veri akışında {symbol} için veri yok.',
  'toast.feedNoData': '{symbol} için henüz veri yok.',
  'toast.imageCopyFallback': 'Görüntü kopyalanamadı. Bunun yerine bir dosya kaydedildi.',
  'toast.imageFailed': 'Grafik görüntüsü yakalanamadı.',
  'toast.indicatorsNotCarried': { one: 'Bu kayıtlı grafikteki {count} gösterge burada kullanılamıyor ve dahil edilmedi.', other: 'Bu kayıtlı grafikteki {count} gösterge burada kullanılamıyor ve dahil edilmedi.' },
}
