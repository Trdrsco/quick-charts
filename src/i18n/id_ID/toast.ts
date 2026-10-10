import type { Translation } from '../runtime'
import type { toast as source } from '../en/toast'

export const toast: Translation<typeof source> = {
  'toast.dismiss': 'Tutup',
  'toast.feedUnavailable': 'Tidak ada data untuk {symbol} dari feed ini.',
  'toast.feedNoData': 'Belum ada data untuk {symbol}.',
  'toast.imageCopyFallback': 'Gambar tidak dapat disalin. File disimpan sebagai gantinya.',
  'toast.imageFailed': 'Gambar chart tidak dapat diambil.',
  'toast.indicatorsNotCarried': { other: '{count} indikator dalam chart tersimpan ini tidak tersedia di sini dan tidak disertakan.' },
}
