import type { Translation } from '../runtime'
import type { toast as source } from '../en/toast'

export const toast: Translation<typeof source> = {
  'toast.dismiss': 'Tutup',
  'toast.feedUnavailable': 'Tiada data untuk {symbol} daripada suapan ini.',
  'toast.feedNoData': 'Belum ada data untuk {symbol}.',
  'toast.imageCopyFallback': 'Imej tidak dapat disalin. Fail disimpan sebagai ganti.',
  'toast.imageFailed': 'Imej carta tidak dapat ditangkap.',
  'toast.indicatorsNotCarried': { other: '{count} penunjuk dalam carta yang disimpan ini tidak tersedia di sini dan telah ditinggalkan.' },
}
