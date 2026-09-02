import type { Translation } from '../runtime'
import type { range as source } from '../en/range'

export const range: Translation<typeof source> = {
  'range.oneDay': '1 jour',
  'range.fiveDays': '5 jours',
  'range.oneMonth': '1 mois',
  'range.threeMonths': '3 mois',
  'range.sixMonths': '6 mois',
  'range.yearToDate': 'Depuis le début de l\'année',
  'range.oneYear': '1 an',
  'range.fiveYears': '5 ans',
  'range.all': 'Toutes les données',
  'range.tip': '{range} · barres de {interval}',
  'range.zoomIn': 'Zoom avant',
  'range.zoomOut': 'Zoom arrière',
  'range.scrollLeft': 'Défiler vers la gauche',
  'range.scrollRight': 'Défiler vers la droite',
  'range.reset': 'Réinitialiser la vue du graphique',
}
