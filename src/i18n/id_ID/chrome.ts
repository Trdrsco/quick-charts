import type { Translation } from '../runtime'
import type { chrome as source } from '../en/chrome'

export const chrome: Translation<typeof source> = {
  'chrome.topBar': 'Bilah alat chart',
  'chrome.bottomBar': 'Bagian bawah chart',
  'chrome.symbolSearch': 'Cari simbol',
  'chrome.compare': 'Bandingkan atau tambah simbol',
  'chrome.chartStyle': 'Gaya chart',
  'chrome.indicators': 'Indikator',
  'chrome.replay': 'Pemutaran ulang bar',
  'chrome.replayChip': 'Pemutaran ulang',
  'chrome.image': 'Gambar chart',
  'chrome.session': 'Sesi perdagangan',
  'chrome.sessionsHeading': 'Sesi',
  'chrome.navigation': 'Navigasi chart',
  'chrome.activeChart': '{symbol}, {timeframe}',
}
