const starterGames = [
  {title:'Forza Horizon 5',genre:'Wyścigi',artId:1551360},
  {title:'Forza Horizon 6',genre:'Wyścigi',artId:2483190},
  {title:'Grand Theft Auto VI',genre:'Akcja',cover:'https://store-images.s-microsoft.com/image/apps.38523.14542422611289128.3b031337-27f7-4c9c-b048-a91f557bda40.67ebe180-f05d-4351-b574-d94b366e0d02'},
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

function finishOnboarding(language,starterTitle) {
  if(starterTitle!==undefined && !games.length){
    for(const {title,genre,artId,cover,platform='Xbox'} of starterGames){
      const item=game(title,platform,cover || cdn(artId));
      item.genre=genre;
      if(artId)item.coverFallback=steamHeader(artId);
      if(platform==='Steam')item.steamAppId=artId;
      if(title===starterTitle){
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

function openOnboarding() {
  if(!needsOnboarding(preferences))return;
  const modal=document.querySelector('#first-run');
  const form=modal.querySelector('form');
  let language='pl';
  const label=key=>language==='en' && Object.hasOwn(english,key)?english[key]:key;

  function paintWelcome() {
    form.lang=language;
    form.innerHTML='<h2 id="first-run-title">'+label('Zacznij z Checkpointem')+'</h2>'+
      '<label>'+label('Język aplikacji')+'<select name="language">'+
      '<option value="pl" '+(language==='pl'?'selected':'')+'>Polski</option>'+
      '<option value="en" '+(language==='en'?'selected':'')+'>English</option></select></label>'+
      (games.length?'<button class="primary" type="submit">'+label('Rozpocznij')+'</button>':
        '<button class="primary" type="submit" value="starter">'+label('Dodaj 9 gier na start')+'</button>'+
        '<button type="submit" value="empty">'+label('Zacznij od zera')+'</button>');
    form.elements.language.onchange=event=>{
      language=event.target.value;
      paintWelcome();
      form.elements.language.focus();
    };
    form.onsubmit=event=>{
      event.preventDefault();
      if(event.submitter?.value==='starter')paintStarter();
      else finishOnboarding(language);
    };
  }

  function paintStarter() {
    form.innerHTML='<h2 id="first-run-title">'+label('W co grasz teraz?')+'</h2>'+
      '<label>'+label('Pokaż na banerze')+'<select name="starter-title">'+
      '<option value="">'+label('Wybiorę później')+'</option>'+
      options(starterGames.map(item=>item.title))+'</select></label>'+
      '<button class="primary" type="submit">'+label('Dodaj zestaw i rozpocznij')+'</button>'+
      '<button type="button" data-onboarding-back>'+label('Wróć')+'</button>';
    form.elements['starter-title'].focus();
    form.querySelector('[data-onboarding-back]').onclick=()=>{
      paintWelcome();
      form.querySelector('[value="starter"]')?.focus();
    };
    form.onsubmit=event=>{
      event.preventDefault();
      finishOnboarding(language,form.elements['starter-title'].value);
    };
  }

  modal.addEventListener('cancel',event=>event.preventDefault());
  paintWelcome();
  modal.showModal();
}
