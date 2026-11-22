const connectionInstructions = {
  pl:{
    title:'Instrukcja',
    intro:'Jak podłączyć konto lub wczytać gry z każdej usługi.',
    steps:{
      steam:{
        info:'Importuje bibliotekę Steam i czas gry. Logujesz się na oficjalnej stronie Steam. Checkpoint nie prosi o hasło, klucz API ani numer ID.',
        items:[
          'W ustawieniach prywatności Steam ustaw „Szczegóły gier” jako publiczne. Bez tego logowanie się uda, ale Steam nie udostępni listy gier.',
          'Na kafelku Steam wybierz „Połącz Steam” i zaloguj się na stronie Steam.',
          'Po powrocie sprawdź podgląd, odznacz tytuły, których nie chcesz, i wybierz „Importuj wybrane”.',
          'Później użyj „Odśwież bibliotekę”. Jeśli masz gotowe dane GetOwnedGames, możesz też wybrać „Import Steam JSON”.',
        ],
        links:[['Ustawienia prywatności Steam','https://steamcommunity.com/my/edit/settings']],
      },
      xbox:{
        info:'Importuje historię grania i podsumowanie osiągnięć. Szczegóły osiągnięć są dostępne z karty gry, gdy mostek jest uruchomiony.',
        items:[
          'Na komputerze skonfiguruj i uruchom Checkpoint Bridge. Klucz OpenXBL wpisz do lokalnej konfiguracji mostka.',
          'W Checkpoincie na tym samym komputerze wybierz „Podłącz bibliotekę” na kafelku Xbox. Zostaw podpowiedziany adres i wpisz osobny klucz mostka.',
          'Kliknij „Pokaż zaimportowane gry”, aby zobaczyć listę. Na karcie gry wybierz „Pokaż osiągnięcia”.',
          'Jeśli korzystasz z telefonu, wyeksportuj plik Xbox przez Bridge i wybierz „Importuj plik” na kafelku Xbox.',
        ],
        links:[['Konfiguracja Checkpoint Bridge','https://github.com/y33bau/checkpoint/tree/main/integrations/consoles']],
      },
      ps:{
        info:'Importuje aktywne pozycje z biblioteki PS4 i PS5 oraz historię grania z czasem gry, jeśli konto ją udostępnia.',
        items:[
          'Na komputerze skonfiguruj i uruchom Checkpoint Bridge. Autoryzację PlayStation przeprowadź według instrukcji mostka i zachowaj dane dostępowe w jego lokalnej konfiguracji.',
          'Na kafelku PlayStation wybierz „Podłącz bibliotekę”. Na tym samym komputerze zostaw podpowiedziany adres i w kolejnym kroku wpisz osobny klucz mostka. Zatwierdź gry w podglądzie.',
          'Użyj „Pokaż zaimportowane gry”, aby wyświetlić swoją kolekcję. Opcja „Synchronizuj bibliotekę” ponownie pobiera listę.',
          'Na telefonie możesz wczytać plik wyeksportowany przez Bridge przyciskiem „Importuj plik”.',
        ],
        links:[['Konfiguracja Checkpoint Bridge','https://github.com/y33bau/checkpoint/tree/main/integrations/consoles']],
      },
      nintendo:{
        info:'Kafelek otwiera oficjalne konto Nintendo i pozwala zapisać pseudonim w tej przeglądarce. Gry dodajesz z katalogu eShop.',
        items:[
          'Kliknij „Zaloguj się na Nintendo” i zaloguj się na stronie Nintendo.',
          'Opcjonalnie wybierz „Dodaj profil” i zapisz pseudonim w Checkpoincie.',
          'W Bibliotece wybierz „Dodaj grę”, ustaw platformę Nintendo i wyszukaj tytuł.',
        ],
        links:[],
      },
      wand:{
        info:'Ręczny import listy gier i publicznych linków do map. Mapy możesz też dodawać pojedynczo na karcie gry.',
        items:[
          'Skopiuj lub wypisz tytuły, po jednym w każdym wierszu. Jeśli masz link do mapy, dodaj go po znaku |.',
          'Na kafelku Wand wybierz „Wklej listę gier”, wklej tekst i przejrzyj podgląd i zatwierdź import. Przycisk „Pokaż zaimportowane gry” otworzy przefiltrowaną bibliotekę.',
          'Żeby przypiąć samą mapę, otwórz kartę gry i wybierz „Mapy i cele”, a potem „Dodaj mapę”.',
        ],
        example:'Elden Ring | https://wand.com/…',
        links:[],
      },
    },
  },
  en:{
    title:'Instructions',
    intro:'How to link an account or import games from each service.',
    steps:{
      steam:{
        info:'Imports your Steam library and play time. You sign in on Steam’s official website. Checkpoint never asks for your password, an API key or your Steam ID.',
        items:[
          'In your Steam privacy settings, make Game details public. Without it, sign-in still works, but Steam will not share your game list.',
          'On the Steam card, select Connect Steam and sign in on the Steam website.',
          'When you return, review the preview, deselect any titles you do not want and select Import selected.',
          'Later, use Refresh library. If you already have GetOwnedGames data, you can also select Import Steam JSON.',
        ],
        links:[['Steam privacy settings','https://steamcommunity.com/my/edit/settings']],
      },
      xbox:{
        info:'Imports play history and achievement summaries. Individual achievements are available on the game card while the bridge is running.',
        items:[
          'Set up and run Checkpoint Bridge on your computer. Add your OpenXBL key to the bridge’s local configuration.',
          'On the same computer, select Connect library on the Xbox card. Keep the suggested address and enter the separate bridge key.',
          'Select Show imported games to see your list. Open a game and choose Show achievements for details.',
          'On a phone, export the Xbox file using the bridge, then select Import file on the Xbox card.',
        ],
        links:[['Set up Checkpoint Bridge','https://github.com/y33bau/checkpoint/tree/main/integrations/consoles']],
      },
      ps:{
        info:'Imports active PS4 and PS5 library entries plus play history and play time when the account provides them.',
        items:[
          'Set up and run Checkpoint Bridge on your computer. Follow the PlayStation authorization steps in the setup guide and keep credentials in the local configuration.',
          'On the PlayStation card, select Connect library. On the same computer, keep the suggested address, enter the separate bridge key and confirm the games in the preview.',
          'Select Show imported games to view your collection. Sync library refreshes the list.',
          'On a phone, use Import file to load a file exported by the bridge.',
        ],
        links:[['Set up Checkpoint Bridge','https://github.com/y33bau/checkpoint/tree/main/integrations/consoles']],
      },
      nintendo:{
        info:'The card opens the official Nintendo Account site and saves an optional nickname in this browser. Add games from the eShop catalogue.',
        items:[
          'Select Sign in on Nintendo and sign in on Nintendo’s website.',
          'Optionally select Add profile to save your nickname in Checkpoint.',
          'In Library, select Add game, choose Nintendo and search for a title.',
        ],
        links:[],
      },
      wand:{
        info:'Manually import a list and public Wand map links. You can also attach individual maps on a game card.',
        items:[
          'Copy or type one title per line. If you have a public map link, add it after |.',
          'On the Wand card, select Paste game list, paste the text and confirm the selected games in the preview. Show imported games opens the filtered library.',
          'To attach an individual map, open the game card, choose Maps and goals, then Add map.',
        ],
        example:'Elden Ring | https://wand.com/…',
        links:[],
      },
    },
  },
};

function renderConnectionGuide() {
  const guide=connectionInstructions[appLanguage()];
  const sections=providers.map(provider=>{
    const manual=guide.steps[provider.id];
    const links=manual.links.map(([label,url])=>'<a class="text-link" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+'</a>').join('');
    return '<details class="connection-guide-section"><summary>'+esc(provider.name)+'</summary>'+
      '<p class="muted">'+esc(manual.info)+'</p><ol>'+manual.items.map(step=>'<li>'+esc(step)+'</li>').join('')+'</ol>'+
      (manual.example?'<p><code>'+esc(manual.example)+'</code></p>':'')+
      (links?'<div class="connection-guide-links">'+links+'</div>':'')+'</details>';
  }).join('');
  return '<details class="panel connection-guide"><summary><span><strong>'+esc(guide.title)+'</strong>'+
    '<small>'+esc(guide.intro)+'</small></span></summary><div class="connection-guide-body">'+sections+'</div></details>';
}
