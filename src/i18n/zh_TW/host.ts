import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': '此行情來源不提供成交量',
  'host.saveConflict': '開啟後已在其他地方儲存過。儲存前請先載入較新的版本。',
  'host.saveNotFound': '已在其他地方刪除。請重新另存為新項目。',
  'host.loadInvalid': '無法開啟。畫面上的內容沒有變更。',
  'host.loadUnavailable': '無法存取已儲存的作業。畫面上的內容沒有變更。',
  'host.loadNotRestored': '無法開啟，畫面上原有的內容也無法還原。在開啟已儲存的圖表或版面配置之前，圖表不會儲存。如要保留畫面上的內容，請先儲存一份副本。',
  'host.notSaving': '圖表目前沒有儲存。請開啟已儲存的圖表或版面配置，從已知狀態開始。儲存副本可保留畫面上的內容，但圖表仍不會儲存。',
}
