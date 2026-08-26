import type { Translation } from '@trdrs/i18n'
import type { broker as source } from '../en/broker'

export const broker: Translation<typeof source> = {
  'broker.positionAlreadyClosed': 'Pozycja jest już zamknięta',
  'broker.orderNotWorking': 'Zlecenie nie jest już aktywne',
  'broker.tickUnknownReprice': 'Nieznana wielkość ticku, nie można zmienić ceny',
  'broker.pricesUnknownReprice': 'Nieznane ceny zlecenia, nie można zmienić ceny',
  'broker.noLimitBand': 'Brak aktualnej ceny limit do wyznaczenia zakresu',
  'broker.noStopBand': 'Brak aktualnej ceny stop do wyznaczenia zakresu',
  'broker.noStopAnchor': 'Brak ceny, do której można odnieść stop',
  'broker.tickUnknown': 'Nieznana wielkość ticku',
  'broker.noAnchor': 'Brak punktu odniesienia',
  'broker.takeProfitAbove': 'Take profit musi być powyżej wejścia',
  'broker.takeProfitBelow': 'Take profit musi być poniżej wejścia',
  'broker.positionClosed': 'Pozycja zamknięta',
  'broker.orderCancelled': 'Zlecenie anulowane',
  'broker.targetMoved': 'Cel przeniesiony na {price}',
  'broker.orderMoved': 'Zlecenie przeniesione na {price}',
  'broker.triggerMoved': 'Wyzwalacz przeniesiony na {price}',
  'broker.limitMoved': 'Limit przeniesiony na {price}',
  'broker.stopMoved': 'Stop przeniesiony na {price}',
  'broker.stopSideUnverified': 'Brak ceny na żywo, strona stopa niezweryfikowana',
}
