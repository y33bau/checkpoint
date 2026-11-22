# Synchronizacja Checkpoint przez Google

1. W konsoli Firebase utwórz projekt Checkpoint i dodaj w nim aplikację webową.
2. W Authentication włącz dostawcę Google i dodaj domenę y33bau.github.io do autoryzowanych domen.
3. Utwórz bazę Cloud Firestore w trybie produkcyjnym. W zakładce Rules opublikuj reguły z pliku firestore.rules. Jeśli projekt jest współdzielony z inną aplikacją, dodaj blok checkpointLibraries do istniejących reguł.
4. W pliku google-sync-config.js podmień wartość null na konfigurację webową z Ustawień projektu Firebase. Użyj wyłącznie publicznej konfiguracji z konsoli, bez klucza konta usługi.
5. Po publikacji zaloguj się tym samym kontem w dwóch profilach przeglądarki. W każdym włącz synchronizację w Ustawieniach. Na pierwszym profilu dodaj grę z oceną i sesją. Na drugim wybierz „Synchronizuj teraz” i sprawdź efekt. Powtórz na iPhonie z aplikacją uruchomioną z ekranu początkowego.

Dane są przypisane do UID Firebase. Gra, sesje, cele i oceny synchronizują się po zmianach, po powrocie do widoku oraz co minutę przy otwartej aplikacji. Przy zmianach po obu stronach użytkownik wybiera wersję dla wspólnych gier. Gry występujące tylko po jednej stronie są zachowywane.

Ten etap obsługuje bibliotekę o rozmiarze do 900 KiB. Nagrania, własne okładki, ustawienia urządzenia i połączenia z platformami pozostają lokalnie. W aplikacji można niezależnie pobrać pełną kopię zapasową.
