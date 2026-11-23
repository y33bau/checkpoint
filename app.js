const app=document.querySelector('#app'), dialog=document.querySelector('#modal'),form=document.querySelector('#form'),fields=document.querySelector('#fields');
const systems=['Xbox','Steam','PlayStation','Nintendo','PC'],statuses=['Gram','W kolejce','Ukończona'],criteria=['Grywalność','Klimat','Dźwięk','Fabuła','Technikalia'];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
function web(s){try{const u=new URL(s);return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}}
const cdn=id=>'https://cdn.cloudflare.steamstatic.com/steam/apps/'+id+'/library_600x900.jpg';
const steamHeader=id=>'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/'+id+'/header.jpg';
const run=()=>({progress:0,goal:'',sessions:[]});
function game(title,system,cover='',catalog='Moje gry'){return {id:crypto.randomUUID(),addedAt:Date.now(),title,system,cover,catalog,status:'W kolejce',runs:{[system]:run()},scores:[],maps:[],tasks:[]}}
const key='checkpoint-diary-v1';let games=JSON.parse(localStorage.getItem(key)||'null')??[],filter='',collection='',platform='';
function persist(){localStorage.setItem(key,JSON.stringify(games));scheduleGoogleSync()}
persist();
const score=g=>{const a=g.scores.filter(Number.isFinite);return a.length?(a.reduce((a,b)=>a+b,0)/a.length):null};
const btn=(label,act,cls='')=>'<button class="'+cls+'" data-act="'+act+'">'+label+'</button>';
const options=(arr,v,label=s=>s)=>arr.map(s=>'<option value="'+esc(s)+'" '+(s===v?'selected':'')+'>'+esc(label(s))+'</option>').join('');
const bar=p=>'<div class="bar"><i style="width:'+Number(p)+'%"></i></div>';
function coverImage(game, eagerCover=false) {
  const main = gameCoverSource(game);
  const fallback = web(game.coverFallback || (game.steamAppId ? steamHeader(game.steamAppId) : ''));
  if (!main && !fallback) return '';
  return '<img loading="'+(eagerCover?'eager':'lazy')+'" alt="" src="'+esc(main || fallback)+'" data-cover-fallback="'+esc(main!==fallback ? fallback : '')+'">';
}
const pageHeading=(title,action='')=>'<div class="top"><h1>'+esc(title)+'</h1>'+action+'</div>';
function youtubeGuide(game,compact=false) {
  const url = new URL('https://www.youtube.com/results');
  const keyword=compact&&appLanguage()==='en'?'solution':t('poradnik');
  url.searchParams.set('search_query', game.title + ' ' + keyword);
  const label=t('Znajdź solucję na YouTube');
  return '<a class="button youtube-guide" href="'+esc(url.href)+'" target="_blank" rel="noopener noreferrer" aria-label="'+esc(label)+'">'+
    '<span class="youtube-play" aria-hidden="true"></span>'+(compact?'YouTube':label)+'</a>';
}

function gameShelf(list) {
  const label = t('Moja kolejka');
  const header = '<div class="now-section-heading"><h2 id="shelf-title">'+label+'</h2>'+
    btn(t('＋ Dodaj do kolejki'),'pick:queue')+'</div>';
  return '<section class="panel now-queue" aria-labelledby="shelf-title" tabindex="-1">'+header+
    (list.length?'<div class="grid library-covers">'+list.map((game,index)=>gameTile(game,{eagerCover:index<4})).join('')+'</div>':
      '<p class="muted queue-empty">'+t('Kolejka jest pusta. Dodaj grę, żeby pojawiła się na półce.')+'</p>')+'</section>';
}
let eveningAfterImport=false;
const active=()=>games.find(g=>'#game-'+g.id===location.hash);
function featuredGame() {
  const activeGames=games.filter(game=>!game.archived&&game.status==='Gram');
  return activeGames.find(game=>game.id===preferences.featuredGameId)||activeGames[0];
}

function featuredPanel(game) {
  const playing=games.filter(item=>!item.archived&&item.status==='Gram');
  const run=game.runs[game.system];
  const pager=playing.length<2?'':'<div class="featured-pager">'+
    '<button type="button" data-act="featured-prev" aria-label="'+t('Poprzednia gra')+'">‹</button>'+
    '<span aria-live="polite">'+(playing.indexOf(game)+1)+' / '+playing.length+'</span>'+
    '<button type="button" data-act="featured-next" aria-label="'+t('Następna gra')+'">›</button></div>';
  return '<section class="panel featured-carousel" data-game-id="'+esc(game.id)+'" data-swipe="'+(playing.length>1)+'">'+
    '<article class="featured-game"><div class="featured-identity">'+
    '<div class="featured-cover" aria-hidden="true">'+featureArtwork(game)+'</div>'+
    '<div class="featured-title"><span class="eyebrow">'+esc(game.system)+(game.demo?' · '+t('Gra przykładowa'):'')+'</span><h2>'+esc(game.title)+'</h2></div></div>'+pager+
    (run.progress>0?'<div class="featured-progress"><span>'+t('Postęp')+' · '+esc(run.progress)+'%</span>'+bar(run.progress)+'</div>':'')+
    '<div class="featured-main-actions">'+btn(t('＋ Zapisz sesję'),'quick','primary')+
    '<button data-game="'+esc(game.id)+'">'+t('Karta gry')+'</button></div>'+
    featuredReturnPanel(game,run)+
    '<details class="featured-more extra-options"><summary>'+t('Więcej')+'</summary>'+
    '<div class="featured-tools">'+quickResources(game)+voiceButton()+youtubeGuide(game,true)+'</div></details>'+
    '<p id="media-status" role="status"></p></article></section>';
}

function stepFeatured(direction, focusAction) {
  const playing=games.filter(game=>!game.archived&&game.status==='Gram');
  if(playing.length<2||recording)return;
  const current=playing.indexOf(featuredGame());
  preferences.featuredGameId=playing[(current+direction+playing.length)%playing.length].id;
  savePreferences();
  render();
  app.querySelector('.featured-carousel')?.setAttribute('data-slide',direction>0?'next':'prev');
  if(focusAction) app.querySelector('[data-act="'+focusAction+'"]')?.focus({preventScroll:true});
}

function featureArtwork(game,{loading="eager",artId}={}) {
  const cover=gameCoverSource(game);
  const fallback=web(game.coverFallback||'');
  const legacySteamId=/steamstatic\.com\/steam\/apps\/(\d+)\//.exec(cover)?.[1];
  const steamId=artId||game.steamAppId||legacySteamId;
  const sources=[
    ...(!validCustomCover(game.customCover)&&/^\d+$/.test(steamId)?['https://cdn.cloudflare.steamstatic.com/steam/apps/'+steamId+'/library_hero.jpg']:[]),
    cover,fallback,...(/^\d+$/.test(steamId)?[cdn(steamId),steamHeader(steamId)]:[]),
  ].filter((url,index,list)=>url&&list.indexOf(url)===index);
  if(!sources.length)return '';
  const [first,...rest]=sources;
  return '<div class="feature-art" aria-hidden="true"><img class="feature-image" alt="" loading="'+loading+'" src="'+esc(first)+'" data-art-next="'+
    esc(JSON.stringify(rest))+'"></div>';
}

const banner=(g,inner)=>'<article class="hero">'+((gameCoverSource(g)||g.coverFallback)?'<div class="game-art">'+coverImage(g)+'</div>':'')+'<div class="hero-content"><span class="eyebrow">'+esc(g.system)+'　/　'+esc(t(g.status))+'</span><h2>'+esc(g.title)+'</h2>'+inner+'</div></article>';

const connectionKey = 'checkpoint-connections-v1';
const providers = [
  { id: 'steam', name: 'Steam', label: 'ID Steam (17 cyfr)', url: 'https://steamcommunity.com/my/', description: 'Zaloguj się przez Steam i zaimportuj bibliotekę.' },
  { id: 'xbox', name: 'Xbox', label: 'Gamertag', url: 'https://www.xbox.com/play', description: 'Zaloguj się przez Microsoft i zaimportuj historię grania Xbox.' },
  { id: 'ps', name: 'PlayStation', label: 'PSN Online ID', url: 'https://www.playstation.com/', description: 'Podaj nick PSN i zaimportuj gry z publicznej historii.' },
  { id:'nintendo', name:'Nintendo', label:'Pseudonim Nintendo (opcjonalnie)', url:'https://accounts.nintendo.com/', description:'Otwórz oficjalne konto Nintendo albo zapisz lokalny pseudonim.' },
  { id: 'wand', name: 'Wand', label: 'Nazwa profilu (opcjonalnie)', url: 'https://www.wand.com/', description: 'Wklej listę gier i linki do map z Wand.' },
];
let connections = {};
try {
  connections = JSON.parse(localStorage.getItem(connectionKey) || '{}') || {};
} catch {
  connections = {};
}
let steamBusy = false;
let steamMessage = '';
let xboxBusy = false;
function connectionPrimary(provider,saved) {
  switch(provider.id){
    case 'steam': return steamConnectButton(saved);
    case 'xbox': return xboxConnectButton(saved);
    case 'ps':
      if(psnImportChecking&&steamServerAddress())
        return '<span class="provider-pending" role="status">'+t('Sprawdzam dostępność importu…')+'</span>';
      if(psnImportAvailable)return btn(t(saved?.lastImport?.mode==='psn-profile'?'Odśwież z PlayStation':'Importuj z PlayStation'),
        'psn-import','primary provider-action');
      return saved?.libraryUrl
        ? btn(t('Odśwież bibliotekę PS'),'source-sync:ps','primary provider-action')
        : btn(t('Podłącz przez Bridge'),'source-connect:ps','primary provider-action');
    case 'nintendo': return '<a class="button provider-action" href="'+provider.url+'" target="_blank" rel="noopener noreferrer">'+t('Otwórz konto Nintendo')+'</a>';
    case 'wand': return btn(t('Wklej listę gier'),'source-file:wand','primary provider-action');
  }
}

function renderConnectionCard(provider) {
  const saved = connections[provider.id];
  const isSteam = provider.id === 'steam';
  const hasLibrary=Object.hasOwn(librarySources,provider.id);
  const description=provider.id==='ps'&&!psnImportAvailable&&(!psnImportChecking||!steamServerAddress())
    ?'Wczytaj bibliotekę i historię grania przez Checkpoint Bridge.':provider.description;
  const steamStatus = isSteam && saved?.syncedAt && !saved?.lastImport
    ? '<small>'+t('Ostatnia synchronizacja')+': ' + esc(new Date(saved.syncedAt).toLocaleString(appLocale())) + '</small>'
    : '';
  const mark=provider.id==='nintendo'?'<span class="provider-mark" aria-hidden="true">N</span>':
    '<span class="provider-mark"><img src="assets/'+provider.id+(provider.id==='wand'?'.ico':'.svg')+'" alt="" width="24" height="24"></span>';
  const primary=provider.id==='steam'||provider.id==='xbox'||provider.id==='ps';
  const heading=primary?'h3':'h2';
  const state=(saved?.librarySyncedAt||saved?.syncedAt)?'Biblioteka zsynchronizowana':
    saved?.libraryUrl?'Adres połączenia zapisany':saved?.lastImport?'Biblioteka wczytana':'Profil zapisany';
  return '<article class="panel platform-card '+provider.id+'"><div class="provider-heading">'+mark+'<'+heading+'>'+
    provider.name+'</'+heading+'></div>'+ '<p class="muted provider-description">'+t(description)+'</p>'+
    '<div class="actions provider-primary">'+connectionPrimary(provider,saved)+'</div>'+
    '<details class="extra-options provider-options"><summary>'+t('Opcje połączenia')+'</summary>'+
    (saved?'<p class="connection-state is-saved">'+t(state)+(saved.profile?' · '+esc(saved.profile):'')+'</p>':'')+
    '<div class="actions">'+
    (provider.id==='nintendo'?'':'<a class="button" href="' + provider.url + '" target="_blank" rel="noopener noreferrer">'+t('Otwórz')+' '+provider.name + '</a>') +
    (isSteam||provider.id==='xbox'?'':btn(saved?.profile?t('Edytuj profil'):t('Dodaj profil'),'profile-'+provider.id)) +
    (provider.id==='xbox'&&saved?.profile?btn(t('Odłącz Xbox'),'xbox-unlink'):'')+(isSteam?btn(t('Pokaż zaimportowane gry'),'source-view:steam')+btn(t('Import Steam JSON'),'import')+(saved?btn(t('Odłącz Steam'),'steam-unlink'):''):'')+
    (hasLibrary?sourceConnectionButtons(provider.id,saved):'')+
    '</div>' + (isSteam && !steamServerAddress() ? '<small>'+t(steamErrorMessage('not_configured'))+'</small>' : '') +
    (hasLibrary?sourceConnectionDetails(provider.id,saved):'')+
    (!isSteam && !hasLibrary ? '<small>'+t(provider.id==='nintendo'?'Logowanie odbywa się na stronie Nintendo. Checkpoint zapisuje pseudonim lokalnie.':'Tryb profilu — bez synchronizacji z kontem.')+'</small>' : '') + steamStatus + '</details>' + (saved?.lastImport?lastImportMarkup(saved):'') +
    (isSteam ? '<p role="status">' + esc(steamMessage) + '</p>' : '') +
    (provider.id==='ps'?sourceStatus('ps'):'') + '</article>';
}

function renderConnections() {
  checkPsnImport();
  const cards=providers.map(renderConnectionCard);
  return pageHeading(t('Połączenia'))+
    '<section class="import-platforms" aria-labelledby="import-platform-title"><div class="import-heading">'+
    '<h2 id="import-platform-title">'+t('Importuj swoje gry')+'</h2>'+
    '<p class="muted">'+t('Dane zapisują się w tej przeglądarce.')+'</p></div>'+
    '<div class="platform-grid import-platform-grid">'+cards.slice(0,3).join('')+'</div></section>'+
    renderConnectionGuide()+'<div class="platform-grid">'+cards.slice(3).join('')+'</div>';
}
function refreshPsnConnection() {
  const psCard=app.querySelector('.platform-card.ps');
  const guideSection=app.querySelector('.connection-guide [data-provider="ps"]');
  if(!psCard||!guideSection)return;
  const provider=providers.find(item=>item.id==='ps');
  const template=document.createElement('template');
  for(const [current,markup,target] of [
    [psCard,renderConnectionCard(provider),'.provider-primary button, .provider-options summary'],
    [guideSection,renderConnectionGuideSection(provider,connectionInstructions[appLanguage()]),'summary'],
  ]){
    template.innerHTML=markup;
    const updated=template.content.firstElementChild;
    const active=document.activeElement;
    const hadFocus=current.contains(active);
    const oldDetails=current.matches('details')?current:current.querySelector('details');
    const newDetails=updated.matches('details')?updated:updated.querySelector('details');
    newDetails.open=oldDetails.open;
    const replacement=hadFocus&&[...updated.querySelectorAll('button,a,summary')].find(element=>
      (active.dataset.act&&element.dataset.act===active.dataset.act)||
      (active.href&&element.href===active.href)||
      (active.tagName==='SUMMARY'&&element.tagName==='SUMMARY'));
    current.replaceWith(updated);
    if(hadFocus)(replacement||updated.querySelector(target))?.focus({preventScroll:true});
  }
}

function toggleGameArchive(game) {
  const archived=Boolean(game.archived);
  if(archived)delete game.archived;
  else game.archived=true;
  try {persist()}
  catch {
    if(archived)game.archived=true;
    else delete game.archived;
    window.alert(t('Nie udało się zapisać zmiany.'));
    return;
  }
  render();
  const nextAction=app.querySelector(archived?'[data-act="session"]':'[data-act="archive-game"]');
  nextAction?.focus();
}

function editConnection(provider) {
  const saved=connections[provider.id];
  openForm(provider.name,input(t(provider.label),'profile',saved?.profile,'maxlength="80"')+
    (saved?'<label><span><input type="checkbox" name="unlink"> '+t('Usuń zapisany profil')+'</span></label>':''),data=>{
    if(data.has('unlink')){
      delete connections[provider.id];
      sourceKeys.delete(provider.id);
      sourceMessages.delete(provider.id);
    }else{
      const profile=data.get('profile').trim();
      if(!profile&&!['wand','nintendo'].includes(provider.id))throw Error(t('Wpisz identyfikator profilu.'));
      connections[provider.id]={...saved,profile};
    }
    localStorage.setItem(connectionKey,JSON.stringify(connections));
  });
}
function xboxConnectButton(saved) {
  const label=xboxBusy?'Łączę konto Xbox…':saved?.profile?'Odśwież historię Xbox':'Importuj historię Xbox';
  return '<button class="primary provider-action" data-act="xbox-sync"'+(xboxBusy||!steamServerAddress()?' disabled':'')+'>'+t(label)+'</button>';
}
function steamConnectButton(saved) {
  const label=steamBusy?'Łączę konto Steam…':saved?'Odśwież bibliotekę':'Importuj bibliotekę Steam';
  return '<button class="primary provider-action" data-act="steam-sync"'+(steamBusy||!steamServerAddress()?' disabled':'')+'>'+t(label)+'</button>';
}
// Uses the import token while it is valid, otherwise signs in through Steam again.
async function syncSteam() {
  if (steamBusy) return;
  if (!steamSessionValid()) {
    try { await beginSteamLogin(); }
    catch (error) { steamMessage = steamFailure(error.code); render(); }
    return;
  }
  steamBusy = true;
  steamMessage = t('Pobieram bibliotekę…');
  if (location.hash === '#connections') render();
  try {
    const data = await loadSteamLibrary();
    if (deviceBusy) return;
    connections.steam = { ...connections.steam, profile: data.steamId, syncedAt: Date.now() };
    localStorage.setItem(connectionKey, JSON.stringify(connections));
    steamMessage = '';
    previewSteam(data, 'sync');
  } catch (error) {
    console.error('Steam import failed', error);
    steamMessage = error.code ? steamFailure(error.code) : error.message || t('Nie udało się pobrać gier.');
  } finally {
    steamBusy = false;
    if (['#connections', '#library', '#now', ''].includes(location.hash)) render();
  }
}
function importSteamGames(data) {
  const valid=steamGameRows(data);
  const imported=[];
  const byId=new Map(games.filter(item=>item.steamAppId).map(item=>[item.steamAppId,item]));
  const byTitle=new Map();
  for(const item of games){
    const title=catalogText(item.title);
    if(!item.steamAppId&&(!byTitle.has(title)||item.runs.Steam))byTitle.set(title,item);
  }
  for (const entry of valid) {
    const title=catalogText(entry.name);
    let item=byId.get(entry.appid)||byTitle.get(title);
    if (!item) {
      item = game(entry.name, 'Steam', cdn(entry.appid), 'Steam');
      games.push(item);
    }
    item.steamAppId = entry.appid;
    byId.set(entry.appid,item);
    if(byTitle.get(title)===item)byTitle.delete(title);
    item.importSources={...item.importSources,steam:true};
    item.cover ||= cdn(entry.appid);
    item.coverFallback ||= steamHeader(entry.appid);
    item.runs.Steam ??= run();
    if (Number.isFinite(entry.playtime_forever)) item.runs.Steam.importedMinutes = entry.playtime_forever;
    if (Number.isFinite(entry.rtime_last_played)) item.runs.Steam.importedPlayedAt = entry.rtime_last_played * 1000;
    imported.push(item);
  }
  attachCriticScores(imported);
  return valid.length;
}

function render(){
 adjustAmbient();
 if(location.hash==='#rank'){
   clearLibraryFilters();
   libraryMode='rated';
   history.replaceState(history.state,'','#library');
 }
 const g=active(),view=location.hash.slice(1)||'now';
 const eveningResults=view==='now'?app.querySelector('#evening-results'):null;
 if(!eveningResults){eveningDuration=undefined;eveningSettings=undefined;}
 const openGameTools=app.querySelector('.featured-more[open]')?.closest('.featured-carousel')?.dataset.gameId;
 document.body.dataset.view=g?'game':view;document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('active',a.hash==='#'+(g?'library':view)));
 if(view==='settings'){app.innerHTML=renderSettings();initializeGoogleSync()}
 else if(view==='news'){app.innerHTML=renderNews();loadNews()}
 else if(view==='connections'){app.innerHTML=renderConnections()}
 else if(g){app.innerHTML=renderGameCard(g)}
 else if(view==='library'){app.innerHTML=renderLibrary();renderLibraryResults()}
 else if(!games.some(game=>!game.archived)){
   app.innerHTML=pageHeading(t('Gram teraz'))+eveningPanel()+
     '<div class="panel empty-library"><h2>'+t('Twoja biblioteka jest pusta')+'</h2><div class="actions">'+
     '<a class="button primary" href="#connections">'+t('Zaimportuj moje gry')+'</a>'+
     btn(t('＋ Dodaj grę'),'pick:playing')+'</div></div>'+gameShelf([])+homePlayerProfiles();
 }
 else{
   const current=featuredGame();
   const addPlaying=btn(t('＋ Dodaj grę'),'pick:playing','now-add-playing');
   app.innerHTML=pageHeading(t('Gram teraz'),addPlaying)+eveningPanel()+
     (current?featuredPanel(current):'<p class="panel">'+t('Nie ogrywasz teraz żadnej gry.')+'</p>')+
     gameShelf(queuedGames(current))+homePlayerProfiles();
 }
 if(eveningResults)app.querySelector('#evening-results')?.replaceWith(eveningResults);
 if(openGameTools&&view==='now'&&featuredGame()?.id===openGameTools){
   app.querySelector('.featured-more').open=true;
 }
 paintMedia(g||(view==='now'?featuredGame():null));
 syncSessionVoice();
 if(g && currentGameTab==='ratings')attachCriticScores([g]);
 if(g && currentGameTab==='goals')wireWandQuickImport(g);
 for(const link of document.querySelectorAll('nav a')) {
   if(link.classList.contains('active')) link.setAttribute('aria-current','page');
   else link.removeAttribute('aria-current');
 }
}
const input=(label,name,val='',attr='')=>'<label>'+label+'<input name="'+name+'" value="'+esc(val)+'" '+attr+'></label>';
const select=(label,name,arr,val,optionLabel)=>'<label>'+label+'<select name="'+name+'">'+options(arr,val,optionLabel)+'</select></label>';
let saveAction;
function openForm(title,body,action){fields.innerHTML='<h2 id="dialog-title">'+title+'</h2>'+body;const save=document.querySelector('#save');save.textContent=t('Zapisz');save.disabled=false;save.hidden=false;saveAction=action;form.onsubmit=submitForm;dialog.showModal()}
document.querySelector('#close').onclick=()=>dialog.close();
dialog.addEventListener('close',()=>dialog.classList.remove('quick-sheet'));
const submitForm=e=>{e.preventDefault();try{saveAction(new FormData(form));persist();dialog.close();render()}catch(err){alert(err.message)}};
function action(act){
 const game=active();
 if(deviceBusy)return;
 if(act.startsWith('player-games:')){
   const id=act.slice('player-games:'.length);
   if(!Object.hasOwn(playerPlatforms,id))return;
   clearLibraryFilters();
   libraryMode='';
   platform=playerPlatforms[id];
   location.hash='library';
   return;
 }
 if(act==='psn-import'){openPsnImport();return}
 if(act==='show-guide'){showQuickGuide();return}
 if(act.startsWith('google-')){googleAction(act);return}
 if(act==='upload-cover'&&game){openCoverUpload(game);return}
 if(act==='refresh-cover'&&game){openCoverRefresh([game]);return}
 if(act==='refresh-all-covers'){openCoverRefresh(games.filter(item=>!item.archived),true);return}
 if(act==='archive-game' && game){toggleGameArchive(game);return}
 if(['wand-maps','stuck','resource-paste','match-maps','match-map-add'].includes(act)){
   const resourceGame=game||featuredGame();
   if(!resourceGame)return;
   if(act==='wand-maps')openWandMaps(resourceGame);
   else if(act==='stuck')openStuck(resourceGame);
   else if(act==='match-maps')openMatchMaps(resourceGame);
   else if(act==='match-map-add')openMatchMapManual(resourceGame);
   else openResourcePaste(resourceGame);
   return;
 }
 if(act==='featured-prev'||act==='featured-next'){stepFeatured(act==='featured-next'?1:-1,act);return}
 const [sourceAction,providerId]=act.split(':');
 if(providerId==='steam'||Object.hasOwn(librarySources,providerId)){
   if(sourceAction==='source-view'){
     clearLibraryFilters();
     librarySource=providerId;
     libraryMode='';
     location.hash='library';return;
   }
   if(sourceAction==='source-file' && providerId!=='steam'){openLibraryFile(providerId);return}
   if(sourceAction==='source-connect' && !['wand','steam'].includes(providerId)){editLibrarySource(providerId,true);return}
   if(sourceAction==='source-sync' && providerId!=='wand'){syncLibrarySource(providerId);return}
 }
 if(act==='xbox-achievements' && game){showXboxAchievements(game);return}
 if(act==='steam-achievements' && game){refreshGameAchievements(game);return}
 if(act.startsWith('game-tab:') && game){
   const tab=act.slice('game-tab:'.length);
   if(!Object.hasOwn(gameTabs,tab))return;
   currentGameTab=tab;
   render();
   app.querySelector('.game-tabs [aria-pressed="true"]')?.focus({preventScroll:true});
   return;
 }
 if(act==='edit-start' && game){editStartRating(game);return}
 if(act==='critics-retry' && game){attachCriticScores([game]);return}
 if(act==='evening-more'){nextEveningPage();return}
 if(act==='evening-shelf'){
   const shelf=app.querySelector('.now-queue');
   shelf?.focus({preventScroll:true});
   shelf?.scrollIntoView({block:'start'});
   return;
 }
 if(act==='evening-after-import'){
   eveningAfterImport=true;
   location.hash='now';
   return;
 }
 if(act==='evening-filters'){openEvening();return}
 if(act==='evening-catalogue'){
   pickEveningDuration(eveningDuration||'30',{...savedEveningSettings(),scope:'catalogue'});
   return;
 }
 if(act.startsWith('evening-queue:')){
   const [,kind,id]=act.split(':');
   queueEveningPick(kind,id);return;
 }
 if(act.startsWith('draw-add:')){const choice=drawnCatalogue[Number(act.slice(9))];if(choice)openGameForm(null,choice);return}
 if(act.startsWith('evening:')){
   const duration=act.slice('evening:'.length);
   if(Object.hasOwn(eveningDurations,duration))pickEveningDuration(duration);
   return;
 }
 if(act==='pick:queue'||act==='pick:playing'){openGamePicker(act.slice(5));return}
 if(act==='edit-hint' && game){editSessionHint(game);return}
 if(act==='edit-return'){
   const selected=game||featuredGame();
   if(selected)editReturn(selected);
   return;
 }
 if(act.startsWith('pin-goal:') && game){toggleGoalPin(game,Number(act.slice(9)));return}
 if(act==='voice-toggle'){toggleVoice(game || featuredGame());return}
 if(act.startsWith('voice-remove:')){removeAttachment(act.slice(13),'voice',game);return}
 if(act==='chronicle-edit' && game){editChronicle(game);return}
 if(act==='chronicle-remove-shot'){removeAttachment(null,'screenshot',game);return}
 if(act==='chronicle-generate'){prepareChronicle(game);return}
 if(act==='chronicle-download' && preparedCard){downloadFile(preparedCard,preparedCard.name);return}
 if(act==='chronicle-share' && preparedCard){
   navigator.share({files:[preparedCard]}).catch(error=>{if(error.name!=='AbortError')chronicleStatus('Nie udało się udostępnić karty.')});
   return;
 }
 if(act==='backup-export'){exportBackup();return}
 if(act==='backup-import'){
   if(recording){backupStatus('Najpierw zakończ nagrywanie.');return}
   document.querySelector('#backup-file').click();return;
 }
 if(act==='library-more'){
   const previous = libraryLimit;
   libraryLimit += libraryPageSize;
   renderLibraryResults();
   app.querySelectorAll('.library-item [data-game]')[previous]?.focus();
   return;
 }
 if(act==='library-reset'){
   clearLibraryFilters();
   render();
   app.querySelector('#search')?.focus();
   return;
 }
 if(act==='library-mode:rated'||act==='library-mode:archive'){
   const mode=act.split(':')[1];
   libraryMode=libraryMode===mode?'':mode;
   libraryLimit=libraryPageSize;
   render();
   (app.querySelector('[data-act="'+act+'"]')||app.querySelector('#search'))?.focus({preventScroll:true});
   return;
 }
 if(act.startsWith('library-filter:')){
   libraryStatus=act.slice('library-filter:'.length);
   libraryLimit=libraryPageSize;
   for(const button of app.querySelectorAll('.library-chips button')) button.setAttribute('aria-pressed',String(button.dataset.act===act));
   renderLibraryResults();
   return;
 }
 if(['library-view:list','library-view:covers','library-view:groups'].includes(act)){
   if(act==='library-view:groups'&&libraryMode==='rated')libraryMode='';
   updateLibrarySetting('view',act.slice('library-view:'.length));
   render();
   app.querySelector('.library-view [aria-pressed="true"]')?.focus({preventScroll:true});
   return;
 }
 if(act==='save-local-settings'){saveLocalSettings();return}
 if(act==='clear-local-data'){clearLocalData();return}
 if(act==='edit-account'){editAccount();return}
 if(act==='force-update'){forceUpdate();return}
 if(act==='refresh-news'){loadNews(true);return}
 if(act==='more-news'){newsLimit+=6;app.innerHTML=renderNews();app.querySelectorAll('.news-story')[newsLimit-6]?.focus();return}
 if(act.startsWith('news-source-')){selectNewsSource(act.slice(12),'button');return}
 const provider=providers.find(p=>act==='profile-'+p.id);
 if(provider){editConnection(provider);return}
 if(act==='steam-sync'){syncSteam();return}
 if(act==='steam-unlink'){unlinkSteam();return}
 if(act==='xbox-sync'){syncXbox();return}
 if(act==='xbox-unlink'){unlinkXbox();return}
 let g=active();if(act==='quick')g=featuredGame();
 if(['add','edit'].includes(act)){openGameForm(g);return}
 if(act==='import'){
   wizardForm(t('Import biblioteki Steam'),'<label>'+t('Wklej JSON z listą gier Steam (GetOwnedGames)')+
     '<textarea name="json" required rows="6"></textarea></label><p id="wizard-status" role="status"></p>',data=>{
     const payload=JSON.parse(data.get('json'));
     steamGameRows(payload);
     dialog.close();
     previewSteam(payload,'file');
   },'Dalej');
   return;
 }
 if(!g)return;const r=g.runs[g.system];
 if(['session','quick'].includes(act))openSessionForm(g,act==='quick');
 if(act==='rate')openGameScores(g);
 if(act==='map')openResourcePaste(g,'map');
 if(act==='task')openForm(t('Nowy cel'),input(t('Co chcesz zrobić?'),'name','','required'),d=>g.tasks.push({name:d.get('name'),done:false}))}
function openGameForm(existing,suggestion,initialTitle='') {
  let selectedGame;
  const platform = existing?.system || suggestion?.store || preferences.profile?.platform || systems[0];
  openForm(existing?t('Edytuj grę'):t('Dodaj grę'),
    select(t('Platforma'),'system',systems,platform) +
    input(t('Tytuł'),'title',existing?.title||suggestion?.title||initialTitle,'required maxlength="120" placeholder="'+t('Zacznij wpisywać tytuł…')+'"') +
    '<div id="catalog-results" class="catalog-results" role="listbox" aria-label="'+t('Podpowiedzi gier')+'" hidden></div>' +
    '<p id="catalog-status" class="muted" role="status"></p>' +
    input(t('Katalog'),'catalog',existing?.catalog||'Moje gry','required') +
    '<label>'+t('Gatunek')+'<select name="genre"><option value="">'+
    (existing?.genre?t('Automatyczny')+' · '+t(existing.genre):t('Automatyczny'))+'</option>'+
    options(gameGenres,existing?.genreOverride,t)+'</select></label>'+
    select(t('Status'),'status',statuses,existing?.status,t), data=>{
      const typedTitle = data.get('title').trim();
      if (!typedTitle) throw Error(t('Wpisz tytuł.'));
      const store = data.get('system');
      const choice = selectedGame();
      const item = existing || games.find(entry=>entry.title.toLowerCase()===typedTitle.toLowerCase()) || game(typedTitle,store);
      const renamed = item.title!==typedTitle;
      Object.assign(item,{title:typedTitle,system:store,status:data.get('status'),catalog:data.get('catalog').trim()||'Moje gry'});
      if(!existing)delete item.archived;
      item.runs[store] ??= run();
      if(renamed){delete item.criticScores;delete item.catalogVersions;delete item.genre}
      const selectedGenre=data.get('genre');
      if(gameGenres.includes(selectedGenre))item.genreOverride=selectedGenre;
      else if(existing)delete item.genreOverride;
      if (renamed && !item.steamAppId) {
        item.cover='';
        item.coverFallback='';
      }
      if(choice){
        if(!item.cover || (renamed && !item.steamAppId))useCatalogCover(item,choice);
        else item.catalogVersions={...item.catalogVersions,[store]:choice.versions||[]};
      }
      if (!games.includes(item)) games.push(item);
      if (!choice && !item.cover) fillExactCover(item,typedTitle,store).finally(()=>attachCriticScores([item]));
      else attachCriticScores([item]);
      location.hash='game-'+item.id;
    });
  selectedGame=wireCatalogSearch(existing?.title||suggestion?.title||initialTitle,suggestion);
}

async function fillExactCover(game, title, store) {
  try {
    const [choice] = await findCatalogGames(title,store,true);
    if (deviceBusy || !choice || !games.includes(game) || game.title!==title || game.system!==store || game.cover) return;
    useCatalogCover(game,choice);
    persist();
    if (!dialog.open) render();
  } catch {
    // The game stays in the library if its catalogue is unavailable.
  }
}

app.addEventListener('error',event=>{
  const image=event.target;
  if(image.matches?.('.feature-art .feature-image')){
    const [next,...rest]=JSON.parse(image.dataset.artNext || '[]');
    if(!next){image.parentElement.remove();return}
    image.dataset.artReady='';
    image.dataset.artNext=JSON.stringify(rest);
    image.src=next;
    return;
  }
  if(image.matches?.('.achievement img')){
    const icon=document.createElement('span');
    icon.className='achievement-icon';
    icon.setAttribute('aria-hidden','true');
    icon.textContent='🏆';
    image.replaceWith(icon);
    return;
  }
  if (!image.matches?.('.cover img, .game-art img')) return;
  const fallback=image.dataset.coverFallback;
  if (fallback) {
    image.dataset.coverFallback='';
    image.src=fallback;
  } else {
    image.remove();
  }
},true);
app.addEventListener('load',event=>{
  const image=event.target;
  if(image.matches?.('.library-covers .cover img')){
    const frame=image.parentElement;
    frame.dataset.artwork='ready';
    const artId=/steamstatic\.com.*?\/apps\/(\d+)\//.exec(image.currentSrc||image.src)?.[1];
    const focus={730:'78% 46%',1551360:'72% 46%',1091500:'73% 46%',292030:'76% 46%',271590:'72% 46%',374320:'69% 46%'};
    if(focus[artId])image.style.objectPosition=focus[artId];
    frame.style.setProperty('--shelf-artwork','url('+JSON.stringify(image.currentSrc||image.src)+')');
  }
  if(!image.matches?.('.feature-art .feature-image'))return;
  image.dataset.artShape=image.naturalWidth/image.naturalHeight>=1.35?'landscape':'portrait';
  image.dataset.artReady='yes';
  const imageUrl=JSON.stringify(image.currentSrc||image.src);
  image.closest('.featured-cover')?.style.setProperty('--featured-image','url('+imageUrl+')');
},true);
app.onclick=event=>{
  const button=event.target.closest('button');
  if(button?.dataset.queue) toggleQueue(button.dataset.queue);
  else if(button?.dataset.playing) togglePlaying(button.dataset.playing);
  else if(button?.dataset.game){
    if(button.closest('#results'))libraryReturnGame=button.dataset.game;
    location.hash='game-'+button.dataset.game;
  }
  else if(button?.dataset.act==='tile-details')toggleTileDetails(button);
  else if(button?.dataset.act) action(button.dataset.act);
};
app.oninput=event=>{
  if(event.target.id!=='search') return;
  filter=event.target.value;
  libraryLimit=libraryPageSize;
  renderLibraryResults();
};
app.onchange=event=>{
  const target=event.target;
  if(deviceBusy)return;
  if(target.id==='start-preview-time'){changeStartPreview(active(),target.value);return}
  if(target.id==='backup-file'){importBackup(target.files?.[0]);target.value='';return}
  if(target.id==='chronicle-file'){saveScreenshot(active(),target.files?.[0]);target.value='';return}
  if(target.id==='app-language'){changeAppLanguage(target.value);return}
  if(target.id==='news-source'){selectNewsSource(target.value,'select');return}
  if(['catalog','platform','library-sort','library-source','library-genre'].includes(target.id)){
    if(target.id==='catalog') collection=target.value;
    if(target.id==='library-source')librarySource=target.value;
    if(target.id==='library-genre')libraryGenre=target.value;
    if(target.id==='platform') platform=target.value;
    if(target.id==='library-sort' && Object.hasOwn(librarySorts,target.value)) updateLibrarySetting('sort',target.value);
    libraryLimit=libraryPageSize;
    renderLibraryResults();
  }
  if(target.id==='system'){active().system=target.value;persist();render()}
  if(target.dataset.task!==undefined){
    active().tasks[Number(target.dataset.task)].done=target.checked;
    persist();
    for(const checkbox of app.querySelectorAll('[data-task]'))if(checkbox.dataset.task===target.dataset.task)checkbox.checked=target.checked;
    if(target.checked && target.closest('.return-tasks'))target.closest('.goal-row').hidden=true;
  }
};
let libraryScroll=0;
let libraryReturnGame;
history.scrollRestoration='manual';
window.onhashchange=event=>{
  const previous=new URL(event.oldURL).hash;
  if(previous==='#library')libraryScroll=window.scrollY;
  render();
  if(eveningAfterImport&&location.hash==='#now'){
    eveningAfterImport=false;
    pickEveningDuration('30',{scope:'library',order:'default',platform:'',mood:'',genre:'',ratedOnly:false});
  }
  if(location.hash==='#library'){
    window.scrollTo(0,libraryScroll);
    if(libraryReturnGame){
      [...app.querySelectorAll('#results [data-game]')].find(el=>el.dataset.game===libraryReturnGame)?.focus({preventScroll:true});
      libraryReturnGame=undefined;
    }
  } else {
    window.scrollTo(0,0);
  }
};

let featuredSwipe;
app.addEventListener('pointerdown',event=>{
  if(!event.isPrimary||event.pointerType==='mouse'||event.target.closest('button,a,audio,input,summary'))return;
  if(event.target.closest('.featured-carousel[data-swipe="true"]'))featuredSwipe={id:event.pointerId,x:event.clientX,y:event.clientY};
});
window.addEventListener('pointercancel',()=>{featuredSwipe=undefined});
window.addEventListener('pointerup',event=>{
  if(featuredSwipe?.id!==event.pointerId)return;
  const dx=event.clientX-featuredSwipe.x;
  const dy=event.clientY-featuredSwipe.y;
  featuredSwipe=undefined;
  if(Math.abs(dx)>=48&&Math.abs(dx)>Math.abs(dy)*1.4)stepFeatured(dx<0?1:-1);
});
applyLanguage();initializeAmbient();render();if(needsOnboarding(preferences))openOnboarding();loadGamePass();attachGenres(games);

resumeSteamLogin();
resumeXboxLogin();
if(googleSyncState)initializeGoogleSync();
