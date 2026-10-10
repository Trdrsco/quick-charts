import type { Translation } from '../runtime'
import type { chrome as source } from '../en/chrome'

export const chrome: Translation<typeof source> = {
  'chrome.topBar': 'Barre d\'outils du graphique',
  'chrome.bottomBar': 'Pied du graphique',
  'chrome.symbolSearch': 'Rechercher un symbole',
  'chrome.compare': 'Comparer ou ajouter un symbole',
  'chrome.chartStyle': 'Style du graphique',
  'chrome.indicators': 'Indicateurs',
  'chrome.replay': 'Relecture des barres',
  'chrome.replayChip': 'Relecture',
  'chrome.image': 'Image du graphique',
  'chrome.session': 'Séance de négociation',
  'chrome.sessionsHeading': 'Séances',
  'chrome.navigation': 'Navigation dans le graphique',
  'chrome.activeChart': '{symbol}, {timeframe}',
  'chrome.scaleHigh': 'High',
  'chrome.scaleLow': 'Low',
  'chrome.scaleBid': 'Bid',
  'chrome.scaleAsk': 'Ask',
}
