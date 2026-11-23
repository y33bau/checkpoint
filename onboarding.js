const starterGames = [
  {title:'Grand Theft Auto VI',genre:'Akcja',minutes:30,cover:'https://store-images.s-microsoft.com/image/apps.38523.14542422611289128.3b031337-27f7-4c9c-b048-a91f557bda40.67ebe180-f05d-4351-b574-d94b366e0d02',
    map:{name:'Leonida · Wand',url:'https://wand.com/pl/maps/grand-theft-auto-vi/leonida'},
    guide:{name:'Eurogamer Polska',url:'https://www.eurogamer.pl/gta-6-poradnik-solucja'}},
  {title:'Forza Horizon 5',genre:'Wyścigi',artId:1551360,minutes:20},
  {title:'Forza Horizon 6',genre:'Wyścigi',cover:'https://cdn.cloudflare.steamstatic.com/steam/apps/2483190/library_hero.jpg'},
  {title:'Grand Theft Auto V',genre:'Akcja',artId:3240220},
  {title:'Minecraft',genre:'Sandbox',minutes:25,cover:'https://store-images.s-microsoft.com/image/apps.58378.13850085746326678.826cc014-d610-46af-bdb3-c5c96be4d22c.64287a91-c69e-4723-bb61-03fecd348c2a'},
  {title:'The Witcher 3: Wild Hunt',genre:'RPG',artId:292030},
  {title:'Cyberpunk 2077',genre:'RPG',artId:1091500},
  {title:'Elden Ring',genre:'RPG',artId:1245620},
  {title:'Counter-Strike 2',genre:'Strzelanki',artId:730,platform:'Steam',minutes:35},
];

function needsOnboarding(settings) {
  return !settings.onboarded && !settings.language;
}

function finishOnboarding(language,choice) {
  if(choice==='demo'&&!games.length){
    const label=key=>language==='en'?(english[key]||key):key;
    for(const [index,{title,genre,minutes,artId,cover,map,guide,platform='Xbox'}] of starterGames.entries()){
      const item=game(title,platform,cover || cdn(artId));
      item.genre=genre;
      item.demo=true;
      if(minutes)item.sessionHint={minutes};
      if(artId)item.coverFallback=steamHeader(artId);
      if(platform==='Steam')item.steamAppId=artId;
      if(map)item.maps.push({...map});
      if(guide)item.guides=[{...guide}];
      if(index===0){
        const activeRun=item.runs[platform];
        activeRun.progress=25;
        activeRun.resumeNote=label('Zapis przy kryjówce w Vice City.');
        activeRun.goal=label('Sprawdź nowy punkt na mapie Leonidy.');
        activeRun.sessions.push({
          date:new Date().toISOString().slice(0,10),minutes:30,note:activeRun.resumeNote,
        });
        item.status='Gram';
        preferences.featuredGameId=item.id;
      }
      games.push(item);
    }
    persist();
  }
  preferences.language=language;
  preferences.onboarded=true;
  savePreferences();
  document.querySelector('#first-run').close();
  applyLanguage();
  const target=choice==='import'?'#connections':choice==='demo'?'#now':location.hash;
  if(target!==location.hash)location.hash=target;
  else render();
}

const guideSections=[
  ['now','Gram teraz','Wybierz ogrywaną grę, zapisz sesję i zostaw sobie następny cel.'],
  ['library','Biblioteka','Dodawaj i filtruj gry. W karcie gry znajdziesz cele, mapy i oceny.'],
  ['news','Newsy','Wybierz źródło, aby przeglądać wiadomości o grach.'],
  ['connections','Połączenia','Zaimportuj gry ze swoich platform lub skorzystaj z instrukcji.'],
  ['settings','Ustawienia','Zmień język i zrób kopię zapasową biblioteki.'],
];

function guideContent(label) {
  return '<ul class="quick-guide">'+guideSections.map(([icon,title,description])=>
    '<li><span class="nav-icon nav-icon-'+icon+'" aria-hidden="true"></span><div><strong>'+label(title)+'</strong>'+
    '<p>'+label(description)+'</p></div></li>').join('')+'</ul>';
}

function showQuickGuide() {
  openForm(t('Krótki przewodnik'),guideContent(t),()=>{});
  const close=document.querySelector('#save');
  close.textContent=t('Zamknij');
  form.onsubmit=event=>{event.preventDefault();dialog.close()};
}

function openOnboarding() {
  if(!needsOnboarding(preferences))return;
  const modal=document.querySelector('#first-run');
  const form=modal.querySelector('form');
  let language='pl';
  const label=key=>language==='en'?(english[key]||key):key;

  function paintWelcome() {
    form.lang=language;
    form.innerHTML='<h2 id="first-run-title">'+label('Zacznij z Checkpointem')+'</h2>'+
      '<p class="muted">'+label('Wybierz grę dopasowaną do czasu, który dziś masz.')+'</p>'+
      '<label>'+label('Język aplikacji')+'<select name="language">'+
      '<option value="pl" '+(language==='pl'?'selected':'')+'>Polski</option>'+
      '<option value="en" '+(language==='en'?'selected':'')+'>English</option></select></label>'+
      '<div class="onboarding-choices"><button class="primary" type="submit" value="import">'+
      label('Zaimportuj moje gry')+'</button>'+
      (games.length?'<button type="submit" value="continue">'+label('Przejdź do moich gier')+'</button>':
        '<button type="submit" value="demo">'+label('Wypróbuj na przykładowych grach')+'</button>')+
      '</div><small>'+label('Dane zapisują się w tej przeglądarce.')+'</small>';
    form.elements.language.onchange=event=>{
      language=event.target.value;
      paintWelcome();
      form.elements.language.focus();
    };
    form.onsubmit=event=>{
      event.preventDefault();
      finishOnboarding(language,event.submitter?.value||'import');
    };
  }

  modal.addEventListener('cancel',event=>event.preventDefault());
  paintWelcome();
  modal.showModal();
}
