import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'Bu veri akışında hacim yok',
  'host.saveConflict': 'Açtığınızdan beri başka bir yerde kaydedildi. Kaydetmeden önce daha yeni sürümü yükleyin.',
  'host.saveNotFound': 'Bu, başka bir yerde silindi. Yeni olarak yeniden kaydedin.',
  'host.loadInvalid': 'Bu açılamadı. Ekranda hiçbir şey değişmedi.',
  'host.loadUnavailable': 'Kaydedilmiş çalışmanıza ulaşılamadı. Ekranda hiçbir şey değişmedi.',
  'host.loadNotRestored': 'Bu açılamadı ve ekrandaki içerik geri getirilemedi. Kaydedilmiş bir grafik veya yerleşim açana kadar grafik kaydetmiyor. Ekrandakini korumak için önce bir kopya kaydedin.',
  'host.notSaving': 'Grafik kaydetmiyor. Bilinen bir durumdan başlamak için kaydedilmiş bir grafik veya yerleşim açın. Bir kopya kaydetmek ekrandakini korur, ancak grafik yine de kaydetmez.',
}
