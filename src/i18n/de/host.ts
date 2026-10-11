import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'Kein Volumen von diesem Feed',
  'host.saveConflict': 'Seit dem Öffnen wurde anderswo gespeichert. Vor dem Speichern die neuere Version laden.',
  'host.saveNotFound': 'Dies wurde anderswo gelöscht. Erneut als neu speichern.',
  'host.loadInvalid': 'Dies konnte nicht geöffnet werden. Auf dem Bildschirm hat sich nichts geändert.',
  'host.loadUnavailable': 'Die gespeicherte Arbeit war nicht erreichbar. Auf dem Bildschirm hat sich nichts geändert.',
  'host.loadNotRestored': 'Dies konnte nicht geöffnet werden, und der vorherige Bildschirminhalt ließ sich nicht wiederherstellen. Der Chart speichert erst wieder, wenn ein gespeicherter Chart oder ein gespeichertes Layout geöffnet wird. Zuerst eine Kopie speichern, um den Bildschirminhalt zu behalten.',
  'host.notSaving': 'Der Chart speichert nicht. Einen gespeicherten Chart oder ein gespeichertes Layout öffnen, um von einem bekannten Stand aus zu beginnen. Eine Kopie zu speichern behält den Bildschirminhalt, aber der Chart speichert weiterhin nicht.',
}
