import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'Aucun volume sur ce flux',
  'host.saveConflict': 'Enregistré ailleurs depuis son ouverture. Chargez la version la plus récente avant d\'enregistrer.',
  'host.saveNotFound': 'Cet élément a été supprimé ailleurs. Enregistrez-le à nouveau comme nouvel élément.',
  'host.loadInvalid': 'Impossible d\'ouvrir cet élément. Rien n\'a changé à l\'écran.',
  'host.loadUnavailable': 'Votre travail enregistré est inaccessible. Rien n\'a changé à l\'écran.',
  'host.loadNotRestored': 'Impossible d\'ouvrir cet élément, et le contenu affiché n\'a pas pu être rétabli. Le graphique n\'enregistre plus jusqu\'à l\'ouverture d\'un graphique ou d\'une disposition enregistrés. Enregistrez d\'abord une copie pour conserver le contenu affiché.',
  'host.notSaving': 'Le graphique n\'enregistre pas. Ouvrez un graphique ou une disposition enregistrés pour repartir d\'un état connu. Enregistrer une copie conserve le contenu affiché, mais le graphique n\'enregistrera toujours pas.',
}
