import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'Tidak ada volume dari feed ini',
  'host.saveConflict': 'Sudah disimpan di tempat lain sejak Anda membukanya. Muat versi yang lebih baru sebelum menyimpan.',
  'host.saveNotFound': 'Ini telah dihapus di tempat lain. Simpan lagi sebagai baru.',
  'host.loadInvalid': 'Ini tidak dapat dibuka. Tidak ada yang berubah di layar.',
  'host.loadUnavailable': 'Pekerjaan tersimpan Anda tidak dapat dijangkau. Tidak ada yang berubah di layar.',
  'host.loadNotRestored': 'Ini tidak dapat dibuka, dan isi layar sebelumnya tidak dapat dikembalikan. Chart tidak menyimpan sampai Anda membuka chart atau tata letak tersimpan. Simpan salinan terlebih dahulu untuk mempertahankan isi layar.',
  'host.notSaving': 'Chart tidak menyimpan. Buka chart atau tata letak tersimpan untuk memulai dari keadaan yang diketahui. Menyimpan salinan mempertahankan isi layar, tetapi chart tetap tidak menyimpan.',
}
