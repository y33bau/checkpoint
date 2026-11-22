const starterGames = [
  {title:'Grand Theft Auto VI',genre:'Akcja',cover:'https://store-images.s-microsoft.com/image/apps.38523.14542422611289128.3b031337-27f7-4c9c-b048-a91f557bda40.67ebe180-f05d-4351-b574-d94b366e0d02',
    map:{name:'Leonida · Wand',url:'https://wand.com/pl/maps/grand-theft-auto-vi/leonida'},
    guide:{name:'Eurogamer Polska',url:'https://www.eurogamer.pl/gta-6-poradnik-solucja'}},
  {title:'Forza Horizon 5',genre:'Wyścigi',artId:1551360},
  {title:'Forza Horizon 6',genre:'Wyścigi',cover:'https://cdn.cloudflare.steamstatic.com/steam/apps/2483190/library_hero.jpg'},
  {title:'Grand Theft Auto V',genre:'Akcja',artId:3240220},
  {title:'Minecraft',genre:'Sandbox',cover:'https://store-images.s-microsoft.com/image/apps.58378.13850085746326678.826cc014-d610-46af-bdb3-c5c96be4d22c.64287a91-c69e-4723-bb61-03fecd348c2a'},
  {title:'The Witcher 3: Wild Hunt',genre:'RPG',artId:292030},
  {title:'Cyberpunk 2077',genre:'RPG',artId:1091500},
  {title:'Elden Ring',genre:'RPG',artId:1245620},
  {title:'Counter-Strike 2',genre:'Strzelanki',artId:730,platform:'Steam'},
];

function needsOnboarding(settings) {
  return !settings.onboarded && !settings.language;
}

function finishOnboarding(language,addStarter=false) {
  if(addStarter && !games.length){
    for(const [index,{title,genre,artId,cover,map,guide,platform='Xbox'}] of starterGames.entries()){
      const item=game(title,platform,cover || cdn(artId));
      item.genre=genre;
      if(artId)item.coverFallback=steamHeader(artId);
      if(platform==='Steam')item.steamAppId=artId;
      if(map)item.maps.push({...map});
      if(guide)item.guides=[{...guide}];
      if(index===0){
        item.status='Gram';
        preferences.featuredGameId=item.id;
      }
      games.push(item);
    }
    persist();
    location.hash='now';
  }
  preferences.language=language;
  preferences.onboarded=true;
  savePreferences();
  document.querySelector('#first-run').close();
  applyLanguage();
  render();
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
  const label=key=>language==='en' && Object.hasOwn(english,key)?english[key]:key;
  const focusTitle=()=>form.querySelector('h2').focus();

  function paintWelcome() {
    form.lang=language;
    form.innerHTML='<h2 id="first-run-title">'+label('Zacznij z Checkpointem')+'</h2>'+
      '<label>'+label('Język aplikacji')+'<select name="language">'+
      '<option value="pl" '+(language==='pl'?'selected':'')+'>Polski</option>'+
      '<option value="en" '+(language==='en'?'selected':'')+'>English</option></select></label>'+
      '<button class="primary" type="submit">'+label('Dalej')+'</button>';
    form.elements.language.onchange=event=>{
      language=event.target.value;
      paintWelcome();
      form.elements.language.focus();
    };
    form.onsubmit=event=>{
      event.preventDefault();
      paintGuide();
    };
  }

  function paintGuide() {
    form.innerHTML='<h2 id="first-run-title" tabindex="-1">'+label('Krótki przewodnik')+'</h2>'+
      guideContent(label)+
      '<div class="actions"><button class="primary" type="submit">'+label('Dalej')+'</button>'+
      '<button type="button" data-onboarding-back>'+label('Wróć')+'</button></div>';
    form.querySelector('[data-onboarding-back]').onclick=()=>{
      paintWelcome();
      form.elements.language.focus();
    };
    form.onsubmit=event=>{
      event.preventDefault();
      if(games.length)finishOnboarding(language);
      else paintLibraryChoice();
    };
    focusTitle();
  }

  function paintLibraryChoice() {
    form.innerHTML='<h2 id="first-run-title" tabindex="-1">'+label('Twoja biblioteka')+'</h2>'+
      '<button class="primary" type="submit" value="starter">'+label('Dodaj 9 gier na start')+'</button>'+
      '<button type="submit" value="empty">'+label('Zacznij od zera')+'</button>';
    form.onsubmit=event=>{
      event.preventDefault();
      if(event.submitter?.value==='starter')paintStarter();
      else finishOnboarding(language);
    };
    focusTitle();
  }

  function paintStarter() {
    const featured=starterGames[0];
    form.innerHTML='<h2 id="first-run-title" tabindex="-1">'+label('Twój zestaw startowy')+'</h2>'+
      '<div class="starter-preview"><img src="'+esc(featured.cover)+'" alt="">'+
      '<div><p class="eyebrow">'+label('Gram teraz')+'</p><strong>'+esc(featured.title)+'</strong>'+
      '<small>'+label('Mapa Leonidy i solucja Eurogamera są już podpięte.')+'</small></div></div>'+
      '<button class="primary" type="submit">'+label('Dodaj zestaw i rozpocznij')+'</button>'+
      '<button type="button" data-onboarding-back>'+label('Wróć')+'</button>';
    form.querySelector('[data-onboarding-back]').onclick=paintLibraryChoice;
    form.onsubmit=event=>{
      event.preventDefault();
      finishOnboarding(language,true);
    };
    focusTitle();
  }

  modal.addEventListener('cancel',event=>event.preventDefault());
  paintWelcome();
  modal.showModal();
}
