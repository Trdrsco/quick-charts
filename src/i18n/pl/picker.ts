import type { Translation } from '../runtime'
import type { picker as source } from '../en/picker'

export const picker: Translation<typeof source> = {
  'picker.title': 'Wskaźniki',
  'picker.search': 'Szukaj wskaźników',
  'picker.noMatches': 'Brak pasujących wskaźników.',
  'picker.collections': 'Kolekcje wskaźników',
  'picker.personal': 'Osobiste',
  'picker.builtin': 'Wbudowane',
  'picker.favorites': 'Ulubione',
  'picker.thousands': ' K',
  'picker.name': 'Nazwa',
  'picker.author': 'Autor',
  'picker.favorite': 'Dodaj {name} do ulubionych',
  'picker.unfavorite': 'Usuń {name} z ulubionych',
  'picker.loading': 'Wczytywanie wskaźników…',
  'picker.unavailable': 'Zawartość wskaźników jest niedostępna. Spróbuj ponownie.',
  'picker.actionFailed': 'Nie udało się wykonać tej czynności. Spróbuj ponownie.',
  'picker.add': 'Dodaj {name}',
  'picker.notPermitted': '{name} nie jest tutaj dostępny',
}
