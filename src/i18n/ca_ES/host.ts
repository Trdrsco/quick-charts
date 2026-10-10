import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'Aquest feed no proporciona volum',
  'host.saveConflict': 'S’ha desat en un altre lloc després d’obrir-lo. Carrega la versió més nova abans de desar.',
  'host.saveNotFound': 'S’ha suprimit en un altre lloc. Torna a desar-lo com a nou.',
  'host.loadInvalid': 'No s’ha pogut obrir. No ha canviat res a la pantalla.',
  'host.loadUnavailable': 'No s’ha pogut accedir a la feina desada. No ha canviat res a la pantalla.',
  'host.loadNotRestored': 'No s’ha pogut obrir, i tampoc no s’ha pogut restablir el que hi havia a la pantalla. El gràfic no desarà fins que obris un gràfic o un disseny desat. Desa primer una còpia per conservar el que hi ha a la pantalla.',
  'host.notSaving': 'El gràfic no està desant. Obre un gràfic o un disseny desat per començar des d’un estat conegut. Desar una còpia conserva el que hi ha a la pantalla, però el gràfic continuarà sense desar.',
}
