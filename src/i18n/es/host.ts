import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'Este feed no aporta volumen',
  'host.saveConflict': 'Se guardó en otro lugar después de abrirlo. Carga la versión más reciente antes de guardar.',
  'host.saveNotFound': 'Se eliminó en otro lugar. Vuelve a guardarlo como nuevo.',
  'host.loadInvalid': 'No se pudo abrir. No cambió nada en la pantalla.',
  'host.loadUnavailable': 'No se pudo acceder a tu trabajo guardado. No cambió nada en la pantalla.',
  'host.loadNotRestored': 'No se pudo abrir, y tampoco se pudo restaurar lo que había en la pantalla. El gráfico no guardará hasta que abras un gráfico o un diseño guardado. Guarda primero una copia para conservar lo que hay en la pantalla.',
  'host.notSaving': 'El gráfico no está guardando. Abre un gráfico o un diseño guardado para empezar desde un estado conocido. Guardar una copia conserva lo que hay en la pantalla, pero el gráfico seguirá sin guardar.',
}
