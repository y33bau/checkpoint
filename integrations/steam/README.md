# Wspólny serwer Steam Checkpointa

Jeden serwer (Cloudflare Worker) obsługuje logowanie Steam dla wszystkich użytkowników aplikacji. Użytkownik wybiera **Połącz Steam**, loguje się na oficjalnej stronie Steam i po powrocie widzi podgląd gier do importu. Nie podaje klucza API, adresu serwera ani SteamID64.

## Jak to działa

1. Aplikacja tworzy losowy `verifier`, zapisuje go w `sessionStorage` i wysyła do serwera tylko jego skrót SHA-256 (`challenge`) oraz adres powrotu.
2. `GET /auth/steam/start` sprawdza adres powrotu z listy `APP_URLS`, zapisuje jednorazowy `state` w D1, ustawia ciasteczko `__Host-checkpoint-steam` i przekierowuje na `steamcommunity.com/openid/login`.
3. `GET /auth/steam/callback` zużywa `state`, porównuje go z ciasteczkiem, weryfikuje odpowiedź Steam przez `check_authentication`, blokuje ponowne użycie `response_nonce` i odsyła do aplikacji jednorazowy kod (`?steam_code=`, ważny 2 minuty). SteamID nie trafia do adresu URL.
4. `POST /api/steam/token` przyjmuje `{ code, verifier }` tylko z dozwolonego `Origin`. Zwraca token importu ważny 10 minut i SteamID64.
5. `GET /api/steam/library` z nagłówkiem `Authorization: Bearer <token>` wywołuje `GetOwnedGames` z kluczem przechowywanym jako sekret serwera.
6. `GET /api/steam/achievements?appids=620,1145360&lang=pl` (do 10 gier, ten sam token) zwraca listy osiągnięć gracza z ikonami (`GetPlayerAchievements` + `GetSchemaForGame`). Aplikacja po imporcie pobiera je automatycznie dla 30 najczęściej granych gier, a na karcie gry jest przycisk „Odśwież osiągnięcia”.

Logowanie jest niezależne od odczytu biblioteki. Jeśli profil ukrywa „Szczegóły gier”, aplikacja zapisuje połączenie i pokazuje komunikat o ustawieniach prywatności.

Wszystkie odpowiedzi mają `Cache-Control: no-store`. CORS odpowiada wyłącznie originom z `APP_URLS`. Limity (na adres IP, okno 10 minut): 10 startów logowania, 20 wymian kodu, 20 odczytów biblioteki. Kody i tokeny są w D1 tylko jako skróty SHA-256.

## Konfiguracja przez właściciela aplikacji (raz)

W katalogu `integrations/steam`:

```sh
npm install
npx wrangler login
npx wrangler d1 create checkpoint-steam          # wpisz zwrócony database_id do wrangler.toml
npx wrangler d1 migrations apply DB --remote --env=""
npx wrangler secret put STEAM_WEB_API_KEY --env=""   # klucz z https://steamcommunity.com/dev/apikey
npm run deploy
```

Następnie wpisz adres Workera (np. `https://checkpoint-steam.<subdomena>.workers.dev`) w `steam-config.js` w katalogu głównym repozytorium, podbij wersję `steam-config.js` w `index.html` i opublikuj GitHub Pages.

Zmienne:

| Nazwa | Rodzaj | Opis |
| --- | --- | --- |
| `STEAM_WEB_API_KEY` | sekret | Klucz Steam Web API. Nigdy nie trafia do przeglądarki. |
| `APP_URLS` | zmienna | Adresy aplikacji (origin + ścieżka) rozdzielone przecinkami. Produkcja: `https://y33bau.github.io/checkpoint/`. |
| `DB` | wiązanie D1 | Baza `checkpoint-steam` z migracjami z `migrations/`. |

Sekret `STEAM_ID64` z poprzedniej wersji nie jest już używany i można go usunąć (`npx wrangler secret delete STEAM_ID64`).

## Test lokalny

```sh
printf 'STEAM_WEB_API_KEY=twoj-klucz\n' > .dev.vars
npm run dev                                  # Worker na http://localhost:8787
cd ../.. && python3 -m http.server 8080      # aplikacja na http://localhost:8080
```

Otwórz `http://localhost:8080/?steam_server=http://localhost:8787#connections`. Nadpisanie adresu serwera działa tylko, gdy aplikacja jest otwarta na `localhost` lub `127.0.0.1`.

Testy automatyczne (bez sieci, Steam jest symulowany): `npm test` w katalogu głównym repozytorium.

## Logowanie Xbox (ten sam serwer)

Użytkownik wybiera **Połącz Xbox** na kafelku Xbox, loguje się kontem Microsoft na oficjalnej stronie i widzi podgląd gier z historii grania (z podsumowaniem osiągnięć i Gamerscore).

1. `GET /auth/xbox/start` przyjmuje `challenge` i `return_to` jak Steam, zapisuje `state` oraz własny weryfikator PKCE dla Microsoft i przekierowuje na `login.microsoftonline.com/consumers` (tylko konta osobiste, zakres `XboxLive.signin`).
2. `GET /auth/xbox/callback` sprawdza `state` i ciasteczko `__Host-checkpoint-xbox`, wymienia kod Microsoft na token, potem na token użytkownika Xbox i XSTS, pobiera historię gier z `titlehub.xboxlive.com` i odsyła do aplikacji jednorazowy `?xbox_code=`. Tokeny Microsoft i Xbox istnieją tylko w trakcie tego żądania i nigdy nie trafiają do D1.
3. `POST /api/xbox/token` (`{ code, verifier }`) zwraca token importu ważny 10 minut i gamertag.
4. `GET /api/xbox/library` zwraca listę w formacie `checkpoint-source-v1` (taki sam jak Checkpoint Bridge), więc identyfikatory gier (`titleId`) są zgodne z wcześniejszymi importami.
   Podczas logowania serwer pobiera też pełne listy osiągnięć (`achievements.xboxlive.com`) dla 10 ostatnio granych gier z osiągnięciami; trafiają do pola `achievements` przy grze. Tokeny Xbox nadal nie są zapisywane.

Ograniczenia Xbox: brak gier kupionych, ale nigdy nieuruchomionych, i brak listy Game Pass.

### Konfiguracja (raz)

1. Na https://entra.microsoft.com → App registrations → New registration: konta **Personal Microsoft accounts only**, Redirect URI typu **Web**: `https://checkpoint-steam.ad-szelag.workers.dev/auth/xbox/callback`.
2. Wpisz Application (client) ID do `XBOX_CLIENT_ID` w `wrangler.toml`.
3. Certificates & secrets → New client secret, a potem w katalogu `integrations/steam`:

```sh
npx wrangler d1 migrations apply DB --remote --env=""
npx wrangler secret put XBOX_CLIENT_SECRET --env=""
npm run deploy
```

| Nazwa | Rodzaj | Opis |
| --- | --- | --- |
| `XBOX_CLIENT_ID` | zmienna | Application (client) ID aplikacji Microsoft Entra. |
| `XBOX_CLIENT_SECRET` | sekret | Client secret tej aplikacji. Nigdy nie trafia do przeglądarki. |

## Publiczna historia gier PlayStation

`POST /api/psn/library` przyjmuje nick PSN i odpowiada w formacie `checkpoint-source-v1`. Import obejmuje gry widoczne dla wszystkich w historii PSN, z czasem gry, gdy PSN go udostępnia. Działa bez logowania użytkownika. Serwer odczytuje historię poprzez społecznościową bibliotekę `psn-api`.

W konfiguracji Workera ustaw dwa parametry dla osobnego konta PSN bez znajomych i bez prywatnych danych użytkowników:

- `PSN_SERVICE_ONLINE_ID` — nick konta serwisowego. Worker nie zwraca jego historii.
- `PSN_NPSSO` — sekret sesji konta serwisowego w Cloudflare Workers. Po unieważnieniu sesji zaktualizuj sekret w Cloudflare.

W środowisku lokalnym te same wartości można ustawić w ignorowanym przez Git pliku `.dev.vars.local`. Użyj aktualnej wersji Workera z D1 i istniejącymi migracjami. Po wdrożeniu wypróbuj import na profilu z publiczną historią i sprawdź komunikat dla profilu z ukrytą historią.
