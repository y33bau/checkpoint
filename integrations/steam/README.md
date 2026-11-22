# Synchronizacja Steam

Checkpoint zapisuje SteamID64 i adres serwera. Odśwież bibliotekę w menu Połączenia, aby zobaczyć podgląd. Aplikacja zapisze tylko zaznaczone gry po potwierdzeniu.

1. Ustaw Szczegóły gier jako publiczne w ustawieniach prywatności Steam.
2. W katalogu tego pliku uruchom npx wrangler deploy.
3. Dodaj klucz Steam Web API poleceniem npx wrangler secret put STEAM_WEB_API_KEY.
4. Dodaj swój SteamID64 poleceniem npx wrangler secret put STEAM_ID64.
5. Otwórz Połączenia → Steam. Podaj adres HTTPS serwera. Wybierz Zaloguj przez Steam, aby uzupełnić identyfikator, lub wpisz swój SteamID64.
6. Sprawdź połączenie i zatwierdź wybrane gry w podglądzie.

Jeśli serwer był już wdrożony, ponownie uruchom npx wrangler deploy, aby dodać obsługę logowania Steam OpenID. Logowanie uzupełnia ID. Import biblioteki nadal korzysta z klucza API i identyfikatora skonfigurowanego jako sekret serwera.

Klucz API wpisz do promptu Wrangler. Serwer zwraca publiczną bibliotekę jednego profilu. Każdy, kto zna adres serwera i SteamID64, może pobrać ten publiczny zestaw danych.
