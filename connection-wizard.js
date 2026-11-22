const steamSetupGuide='https://github.com/y33bau/checkpoint/tree/main/integrations/steam';
const steamPendingKey='checkpoint-steam-openid-v1';

function steamServer(raw) {
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search)
    throw Error(t('Podaj adres HTTPS serwera bez dodatkowych parametrów.'));
  return url.href;
}

function connectionStep(number,body) {
  return '<p class="wizard-step">'+t('Krok')+' '+number+' / 2</p>'+body;
}

function wizardForm(title,body,submit,label) {
  if(dialog.open)dialog.close();
  openForm(title,body,()=>{});
  const save=document.querySelector('#save');
  save.textContent=t(label);
  form.onsubmit=event=>{
    event.preventDefault();
    const status=document.querySelector('#wizard-status');
    try{submit(new FormData(form))}
    catch(error){status.textContent=error.message}
  };
}

function openSteamWizard() {
  const saved=connections.steam;
  wizardForm('Steam',connectionStep(1,
    '<p>'+t('Wklej adres serwera importu Steam. To konfiguracja wykonywana raz.')+'</p>'+
    input(t('Adres serwera Steam'),'server',saved?.server,'type="url" required placeholder="https://…"')+
    '<a class="text-link" href="'+steamSetupGuide+'" target="_blank" rel="noopener noreferrer">'+t('Jak podłączyć Steam?')+'</a>'+
    (saved?'<div class="actions"><button id="steam-unlink" type="button">'+t('Usuń zapisany profil')+'</button></div>':'')+
    '<p id="wizard-status" role="status"></p>'),
  data=>openSteamIdentityStep(steamServer(data.get('server').trim()),saved?.profile),'Dalej');
  const unlink=document.querySelector('#steam-unlink');
  if(unlink)unlink.onclick=()=>{
    delete connections.steam;
    steamMessage='';
    localStorage.setItem(connectionKey,JSON.stringify(connections));
    dialog.close();
    render();
  };
}

function openSteamIdentityStep(server,id='',message='') {
  wizardForm('Steam',connectionStep(2,
    '<p>'+t('Zaloguj się na oficjalnej stronie Steam lub wpisz swój identyfikator.')+'</p>'+
    '<button type="button" id="steam-sign-in">'+t('Zaloguj przez Steam')+'</button>'+
    input(t('ID Steam (17 cyfr)'),'profile',id,'required inputmode="numeric" pattern="[0-9]{17}"')+
    '<a class="text-link" href="https://help.steampowered.com/pl/faqs/view/2816-be67-5b69-0fec" target="_blank" rel="noopener noreferrer">'+t('Gdzie znaleźć ID Steam?')+'</a>'+
    '<p id="wizard-status" role="status">'+esc(message)+'</p>'),data=>{
      const profile=data.get('profile').trim();
      if(!/^\d{17}$/.test(profile))throw Error(t('Wpisz 17 cyfr identyfikatora Steam.'));
      const saved=connections.steam;
      const keep=saved?.profile===profile&&saved?.server===server;
      connections.steam={...(keep?saved:{}),profile,server};
      localStorage.setItem(connectionKey,JSON.stringify(connections));
      dialog.close();
      render();
      syncSteam();
    },'Sprawdź połączenie');
  const login=document.querySelector('#steam-sign-in');
  const status=document.querySelector('#wizard-status');
  login.onclick=async()=>{
    login.disabled=true;
    status.textContent=t('Sprawdzam logowanie Steam…');
    try{
      const check=await fetch(new URL('/auth/steam/status',server),{signal:AbortSignal.timeout(6000)});
      const supported=check.ok&&((await check.json()).steamOpenId===true);
      if(!supported)throw Error('Update required');
      if(document.querySelector('#steam-sign-in')!==login || !dialog.open)return;
      const state=crypto.randomUUID().replaceAll('-','');
      sessionStorage.setItem(steamPendingKey,JSON.stringify({state,server,created:Date.now()}));
      const url=new URL('/auth/steam/start',server);
      url.searchParams.set('state',state);
      location.assign(url.href);
    }catch{status.textContent=t('Logowanie wymaga aktualnego serwera Steam. Możesz też wpisać ID.')}
    finally{login.disabled=false}
  };
}

function resumeSteamIdentity() {
  const url=new URL(location.href);
  const state=url.searchParams.get('steam_state');
  if(!state)return;
  let pending;
  try{
    pending=JSON.parse(sessionStorage.getItem(steamPendingKey)||'null');
    sessionStorage.removeItem(steamPendingKey);
  }catch{return}
  const id=url.searchParams.get('steam_id') || '';
  const succeeded=/^\d{17}$/.test(id)&&!url.searchParams.has('steam_error');
  for(const param of ['steam_state','steam_id','steam_error'])url.searchParams.delete(param);
  history.replaceState(null,'',url.href);
  if(!pending||pending.state!==state||Date.now()-pending.created>600000||needsOnboarding(preferences))return;
  const message=t(succeeded?'Steam zwrócił identyfikator. Sprawdź połączenie, aby wyświetlić gry.':'Logowanie nie zostało potwierdzone. Spróbuj ponownie lub wpisz identyfikator.');
  openSteamIdentityStep(steamServer(pending.server),succeeded?id:'',message);
}

function consoleConnectionStep(provider,connectAfter) {
  const source=librarySources[provider];
  const existing=connections[provider];
  wizardForm(t('Podłącz bibliotekę')+' · '+source.name,connectionStep(1,
    '<p>'+t('Uruchom Checkpoint Bridge na komputerze. Możesz użyć podpowiedzianego adresu.')+'</p>'+
    input(t('Adres połączenia'),'server',existing?.libraryUrl||localBridge+source.path,'type="url" required')+
    '<a class="text-link" href="'+sourceGuide+'" target="_blank" rel="noopener noreferrer">'+t('Konfiguracja połączenia')+'</a>'+
    (existing?.libraryUrl?'<div class="actions"><button id="console-unlink" type="button">'+t('Odłącz bibliotekę')+'</button></div>':'')+
    '<p id="wizard-status" role="status"></p>'),data=>{
     consoleKeyStep(provider,sourceURL(data.get('server').trim()),connectAfter);
    },'Dalej');
  const unlink=document.querySelector('#console-unlink');
  if(unlink)unlink.onclick=()=>{
    const retained={...existing};
    delete retained.libraryUrl;
    delete retained.librarySyncedAt;
    connections[provider]=retained;
    sourceKeys.delete(provider);
    sourceMessages.delete(provider);
    localStorage.setItem(connectionKey,JSON.stringify(connections));
    dialog.close();
    render();
  };
}

function consoleKeyStep(provider,address,connectAfter) {
  const existing=connections[provider];
  wizardForm(t('Podłącz bibliotekę')+' · '+librarySources[provider].name,connectionStep(2,
    '<p>'+t('Podaj osobny klucz Checkpoint Bridge z lokalnej konfiguracji.')+'</p>'+
    input(t('Klucz programu'),'access',sourceKeys.get(provider),'type="password" minlength="24" required autocomplete="off"')+
    '<p id="wizard-status" role="status"></p>'),data=>{
      const key=data.get('access').trim();
      if(key.length<24)throw Error(t('Podaj prawidłowy klucz programu.'));
      connections[provider]={profile:existing?.profile||'',...existing,libraryUrl:address,
        librarySyncedAt:existing?.libraryUrl===address?existing.librarySyncedAt:null};
      sourceKeys.set(provider,key);
      sourceMessages.delete(provider);
      localStorage.setItem(connectionKey,JSON.stringify(connections));
      dialog.close();
      render();
      if(connectAfter)syncLibrarySource(provider);
    },connectAfter?'Sprawdź połączenie':'Zapisz');
}
