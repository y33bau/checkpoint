# Synchronizacja Steam

Checkpoint zapisuje SteamID64 i adres serwera. Odświeża bibliotekę przy otwarciu aplikacji po 24 godzinach od ostatniej synchronizacji. Możesz też użyć przycisku Odśwież bibliotekę w menu Połączenia.

1. Ustaw Szczegóły gier jako publiczne w ustawieniach prywatności Steam.
2. W katalogu tego pliku uruchom npx wrangler deploy.
3. Dodaj klucz Steam Web API poleceniem npx wrangler secret put STEAM_WEB_API_KEY.
4. Dodaj swój SteamID64 poleceniem npx wrangler secret put STEAM_ID64.
5. Otwórz Połączenia → Steam. Wpisz ten sam SteamID64 i adres HTTPS serwera.
6. Naciśnij Odśwież bibliotekę.

Klucz API wpisz do promptu Wrangler. Serwer zwraca publiczną bibliotekę jednego profilu. Każdy, kto zna adres serwera i SteamID64, może pobrać ten publiczny zestaw danych.
