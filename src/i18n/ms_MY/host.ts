import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'Tiada volum daripada suapan ini',
  'host.saveConflict': 'Disimpan di tempat lain sejak anda membukanya. Muatkan versi yang lebih baharu sebelum menyimpan.',
  'host.saveNotFound': 'Ini telah dipadamkan di tempat lain. Simpan semula sebagai baharu.',
  'host.loadInvalid': 'Ini tidak dapat dibuka. Tiada apa-apa yang berubah pada skrin.',
  'host.loadUnavailable': 'Kerja yang anda simpan tidak dapat dicapai. Tiada apa-apa yang berubah pada skrin.',
  'host.loadNotRestored': 'Ini tidak dapat dibuka, dan apa yang ada pada skrin tidak dapat dipulihkan. Carta tidak menyimpan sehingga anda membuka carta atau susun atur yang disimpan. Simpan salinan dahulu untuk mengekalkan apa yang ada pada skrin.',
  'host.notSaving': 'Carta tidak menyimpan. Buka carta atau susun atur yang disimpan untuk bermula daripada keadaan yang diketahui. Menyimpan salinan mengekalkan apa yang ada pada skrin, tetapi carta masih tidak akan menyimpan.',
}
