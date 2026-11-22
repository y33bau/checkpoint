# Checkpoint Bridge

Mostek działa na Twoim komputerze. Łączy się w trybie odczytu z OpenXBL i PlayStation. Możesz korzystać z jednego lub obu dostawców. Wymaga Node.js 20 lub nowszego.

## Konfiguracja na komputerze

1. W tym katalogu uruchom **npm ci**.
2. Utwórz lokalny plik **.env**. Dodaj **OPENXBL_API_KEY** z własnego konta OpenXBL albo **PSN_NPSSO** zgodnie z instrukcją społecznościowego pakietu psn-api. Te dane umieszczaj tylko w lokalnym pliku. Dodaj **CHECKPOINT_BRIDGE_KEY** jako osobny losowy klucz o długości co najmniej 24 znaków.
3. Uruchom **node --env-file=.env bridge.mjs**.
4. Otwórz Checkpoint na tym samym komputerze. W **Połączeniach** wybierz Xbox lub PlayStation, naciśnij **Podłącz bibliotekę** i pozostaw podpowiedziany adres. Wpisz wyłącznie **CHECKPOINT_BRIDGE_KEY**. Gdy przeglądarka zapyta o dostęp do sieci lokalnej, zezwól na dostęp, żeby połączyć się z programem na komputerze.
5. Użyj **Pokaż zaimportowane gry**. Na karcie gry Xbox możesz wyświetlić szczegóły osiągnięć, gdy mostek jest dostępny. Adres połączenia jest zapisany lokalnie. Klucz mostka jest przechowywany w pamięci otwartej aplikacji.

## Opcja pliku na telefon

Uruchom **node --env-file=.env bridge.mjs xbox** albo **node --env-file=.env bridge.mjs ps**. Polecenie utworzy plik **checkpoint-xbox.json** albo **checkpoint-ps.json**. Przenieś go na telefon i wybierz **Połączenia → Importuj plik** przy właściwej usłudze. Plik zawiera dane biblioteki, bez poświadczeń.

## Zakres danych

- Xbox korzysta ze społecznościowego OpenXBL i łączy historię uruchomionych gier z podsumowaniem osiągnięć. Szczegóły osiągnięć pobiera na żądanie. Zbiory zależą od dostępności i danych zwróconych przez konto.
- PlayStation korzysta ze społecznościowego psn-api. Import obejmuje aktywne uprawnienia w PlayStation Store dla PS4 i PS5 oraz osobno historię grania, jeśli dostawca ją udostępni. Po wygaśnięciu autoryzacji trzeba ją ponowić.
- Wand obsługuje wklejenie jednego tytułu na wiersz. Po znaku | możesz podać publiczny link do mapy Wand. Import przypina link i oznacza źródło przy grze. Nowe tytuły trafiają do katalogu Wand, na platformę PC.

Źródła: [OpenXBL](https://api.xbl.io/docs) · [Autoryzacja psn-api](https://psn-api.achievements.app/authentication/authenticating-manually)
