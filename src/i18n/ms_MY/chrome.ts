import type { Translation } from '../runtime'
import type { chrome as source } from '../en/chrome'

export const chrome: Translation<typeof source> = {
  'chrome.topBar': 'Bar alat carta',
  'chrome.bottomBar': 'Bahagian bawah carta',
  'chrome.symbolSearch': 'Cari simbol',
  'chrome.compare': 'Bandingkan atau tambah simbol',
  'chrome.chartStyle': 'Gaya carta',
  'chrome.indicators': 'Penunjuk',
  'chrome.replay': 'Main semula bar',
  'chrome.replayChip': 'Main semula',
  'chrome.image': 'Imej carta',
  'chrome.session': 'Sesi dagangan',
  'chrome.sessionsHeading': 'Sesi',
  'chrome.navigation': 'Navigasi carta',
  'chrome.activeChart': '{symbol}, {timeframe}',
}
