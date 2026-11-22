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

function saveSteamProfile(steamId) {
  const saved=connections.steam;
  const {server,...kept}=saved?.profile===steamId?saved:{};
  connections.steam={...kept,profile:steamId};
  localStorage.setItem(connectionKey,JSON.stringify(connections));
}

function unlinkSteam() {
  delete connections.steam;
  forgetSteamSession();
  steamMessage='';
  localStorage.setItem(connectionKey,JSON.stringify(connections));
  render();
}

async function resumeSteamLogin() {
  const result=takeSteamReturn();
  if(!result||needsOnboarding(preferences))return;
  if(location.hash!=='#connections')location.hash='connections';
  if(result.error){
    steamMessage=steamFailure(result.error);
    render();
    return;
  }
  steamBusy=true;
  steamMessage=t('Łączę konto Steam…');
  render();
  try{
    const session=await redeemSteamCode(result.code,result.pending);
    saveSteamProfile(session.steamId);
  }catch(error){
    steamMessage=steamFailure(error.code);
    return;
  }finally{
    steamBusy=false;
    render();
  }
  await syncSteam();
}

function unlinkXbox() {
  delete connections.xbox;
  sourceKeys.delete('xbox');
  sourceMessages.delete('xbox');
  forgetXboxSession();
  localStorage.setItem(connectionKey,JSON.stringify(connections));
  render();
}

// Uses the Xbox import token while it is valid, otherwise signs in with Microsoft again.
async function syncXbox() {
  if(xboxBusy)return;
  if(!xboxSessionValid()){
    try{await beginXboxLogin()}
    catch(error){setSourceStatus('xbox',t(xboxErrorMessage(error.code)));render()}
    return;
  }
  xboxBusy=true;
  setSourceStatus('xbox',t('Pobieram bibliotekę…'));
  render();
  try{
    const data=await loadXboxLibrary();
    setSourceStatus('xbox','');
    previewConsole(data,'xbox','sync');
  }catch(error){
    setSourceStatus('xbox',t(error.code?xboxErrorMessage(error.code):'Nie udało się wczytać listy. Sprawdź format danych.'));
  }finally{
    xboxBusy=false;
    render();
  }
}

async function resumeXboxLogin() {
  const result=takeXboxReturn();
  if(!result||needsOnboarding(preferences))return;
  if(location.hash!=='#connections')location.hash='connections';
  if(result.error){
    setSourceStatus('xbox',t(xboxErrorMessage(result.error)));
    render();
    return;
  }
  xboxBusy=true;
  setSourceStatus('xbox',t('Łączę konto Xbox…'));
  render();
  try{
    const session=await redeemXboxCode(result.code,result.pending);
    connections.xbox={...connections.xbox,profile:session.gamertag||connections.xbox?.profile||'Xbox'};
    localStorage.setItem(connectionKey,JSON.stringify(connections));
  }catch(error){
    setSourceStatus('xbox',t(xboxErrorMessage(error.code)));
    return;
  }finally{
    xboxBusy=false;
    render();
  }
  await syncXbox();
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
