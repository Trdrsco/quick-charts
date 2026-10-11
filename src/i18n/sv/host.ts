import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'Ingen volym från detta flöde',
  'host.saveConflict': 'Sparat på annat håll sedan du öppnade det. Läs in den nyare versionen innan du sparar.',
  'host.saveNotFound': 'Detta har raderats på annat håll. Spara det igen som nytt.',
  'host.loadInvalid': 'Det gick inte att öppna. Inget på skärmen ändrades.',
  'host.loadUnavailable': 'Det gick inte att nå ditt sparade arbete. Inget på skärmen ändrades.',
  'host.loadNotRestored': 'Det gick inte att öppna, och det som fanns på skärmen kunde inte återställas. Diagrammet sparar inte förrän du öppnar ett sparat diagram eller en sparad layout. Spara först en kopia för att behålla det som finns på skärmen.',
  'host.notSaving': 'Diagrammet sparar inte. Öppna ett sparat diagram eller en sparad layout för att börja från ett känt läge. En sparad kopia behåller det som finns på skärmen, men diagrammet sparar fortfarande inte.',
}
