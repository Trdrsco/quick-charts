import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'Ten feed nie podaje wolumenu',
  'host.saveConflict': 'Od otwarcia zapisano to w innym miejscu. Przed zapisaniem wczytaj nowszą wersję.',
  'host.saveNotFound': 'To zostało usunięte w innym miejscu. Zapisz to ponownie jako nowe.',
  'host.loadInvalid': 'Nie udało się tego otworzyć. Na ekranie nic się nie zmieniło.',
  'host.loadUnavailable': 'Nie udało się uzyskać dostępu do zapisanej pracy. Na ekranie nic się nie zmieniło.',
  'host.loadNotRestored': 'Nie udało się tego otworzyć ani przywrócić tego, co było na ekranie. Wykres nie będzie zapisywany, dopóki nie otworzysz zapisanego wykresu lub układu. Najpierw zapisz kopię, aby zachować to, co jest na ekranie.',
  'host.notSaving': 'Wykres nie jest zapisywany. Otwórz zapisany wykres lub układ, aby zacząć od znanego stanu. Zapisanie kopii zachowa to, co jest na ekranie, ale wykres nadal nie będzie zapisywany.',
}
