const app=document.querySelector('#app'), dialog=document.querySelector('#modal'),form=document.querySelector('#form'),fields=document.querySelector('#fields');
const systems=['Xbox','Steam','PlayStation','Nintendo','PC'],statuses=['Gram','W kolejce','Ukończona'],criteria=['Grywalność','Klimat','Dźwięk','Fabuła','Technikalia'];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
function web(s){try{const u=new URL(s);return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}}
const cdn=id=>'https://cdn.cloudflare.steamstatic.com/steam/apps/'+id+'/library_600x900.jpg';
const steamHeader=id=>'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/'+id+'/header.jpg';
const run=()=>({progress:0,goal:'',sessions:[]});
function game(title,system,cover='',catalog='Moje gry'){return {id:crypto.randomUUID(),addedAt:Date.now(),title,system,cover,catalog,status:'W kolejce',runs:{[system]:run()},scores:[],maps:[],tasks:[]}}
const key='checkpoint-diary-v1';let games=JSON.parse(localStorage.getItem(key)||'null')??[],filter='',collection='',platform='';
function persist(){localStorage.setItem(key,JSON.stringify(games))}
persist();
const score=g=>{const a=g.scores.filter(Number.isFinite);return a.length?(a.reduce((a,b)=>a+b,0)/a.length):null};
const btn=(label,act,cls='')=>'<button class="'+cls+'" data-act="'+act+'">'+label+'</button>';
const options=(arr,v,label=s=>s)=>arr.map(s=>'<option value="'+esc(s)+'" '+(s===v?'selected':'')+'>'+esc(label(s))+'</option>').join('');
const bar=p=>'<div class="bar"><i style="width:'+Number(p)+'%"></i></div>';
function coverImage(game) {
  const main = web(game.cover || '');
  const fallback = web(game.coverFallback || (game.steamAppId ? steamHeader(game.steamAppId) : ''));
  if (!main && !fallback) return '';
  return '<img loading="lazy" alt="" src="'+esc(main || fallback)+'" data-cover-fallback="'+esc(main!==fallback ? fallback : '')+'">';
}
const pageHeading=(title,action='')=>'<div class="top"><h1>'+esc(title)+'</h1>'+action+'</div>';
function youtubeGuide(game) {
  const url = new URL('https://www.youtube.com/results');
  url.searchParams.set('search_query', game.title + ' ' + t('poradnik'));
  return '<a class="button youtube-guide" href="'+esc(url.href)+'" target="_blank" rel="noopener noreferrer">'+
    '<span class="youtube-play" aria-hidden="true"></span>'+t('Znajdź solucję na YouTube')+'</a>';
}

function gameShelf(list) {
  const label = t('Moja kolejka');
  const header = '<div class="now-section-heading"><h2 id="shelf-title">'+label+'</h2>'+
    btn(t('＋ Dodaj do kolejki'),'pick:queue')+'</div>';
  const cases = list.map(game=>{
    const title = esc(game.title);
    const platforms = esc(Object.keys(game.runs).join(' · '));
    return '<button class="shelf-game" data-game="'+game.id+'">'+
      '<span class="case-stage"><span class="game-case">'+
      '<span class="case-edge" aria-hidden="true">'+title+'</span>'+
      '<span class="cover" aria-hidden="true"><b>'+title+'</b>'+coverImage(game)+'</span>'+
      '</span></span><span class="shelf-caption"><strong>'+title+'</strong><small>'+platforms+'</small>'+gamePassNotice(game)+'</span></button>';
  }).join('');
  return '<section class="panel now-queue" aria-labelledby="shelf-title">'+header+
    (cases?'<div class="game-shelf"><div class="shelf-track">'+cases+'</div></div>':'')+'</section>';
}
const active=()=>games.find(g=>'#game-'+g.id===location.hash);
function featuredGame() {
  const activeGames=games.filter(game=>game.status==='Gram');
  return activeGames.find(game=>game.id===preferences.featuredGameId)||activeGames[0];
}

function featuredPanel(game) {
  const playing=games.filter(item=>item.status==='Gram');
  const run=game.runs[game.system];
  const lastNote=run.resumeNote||run.sessions.at(-1)?.note;
  const pager=playing.length<2?'':'<div class="featured-pager">'+
    '<button type="button" data-act="featured-prev" aria-label="'+t('Poprzednia gra')+'">‹</button>'+
    '<span aria-live="polite">'+(playing.indexOf(game)+1)+' / '+playing.length+'</span>'+
    '<button type="button" data-act="featured-next" aria-label="'+t('Następna gra')+'">›</button></div>';
  return '<section class="panel featured-carousel" data-swipe="'+(playing.length>1)+'">'+
    '<article class="featured-game"><div class="featured-identity">'+
    '<div class="featured-cover" aria-hidden="true">'+featureArtwork(game)+'</div>'+
    '<div class="featured-title"><span class="eyebrow">'+esc(game.system)+'</span><h2>'+esc(game.title)+'</h2></div></div>'+
    (run.progress>0?'<div class="featured-progress"><span>'+t('Postęp')+' · '+esc(run.progress)+'%</span>'+bar(run.progress)+'</div>':'')+
    (run.goal?'<p class="featured-goal"><strong>'+t('Następny cel')+'</strong> '+esc(run.goal)+'</p>':'')+
    (lastNote?'<p class="featured-note">'+esc(lastNote)+'</p>':'')+
    '<div class="featured-main-actions">'+btn(t('＋ Zapisz sesję'),'quick','primary')+
    '<button data-game="'+esc(game.id)+'">'+t('Karta gry')+'</button></div>'+
    '<div class="featured-tools">'+quickResources(game)+voiceButton()+'</div>'+
    '<div id="featured-voice"></div><p id="media-status" role="status"></p></article>'+pager+'</section>';
}

function stepFeatured(direction, focusAction) {
  const playing=games.filter(game=>game.status==='Gram');
  if(playing.length<2||recording)return;
  const current=playing.indexOf(featuredGame());
  preferences.featuredGameId=playing[(current+direction+playing.length)%playing.length].id;
  savePreferences();
  render();
  app.querySelector('.featured-carousel')?.setAttribute('data-slide',direction>0?'next':'prev');
  if(focusAction) app.querySelector('[data-act="'+focusAction+'"]')?.focus({preventScroll:true});
}

function featureArtwork(game) {
  const cover=web(game.cover||'');
  const fallback=web(game.coverFallback||'');
  const legacySteamId=/steamstatic\.com\/steam\/apps\/(\d+)\//.exec(cover)?.[1];
  const steamId=game.steamAppId||legacySteamId;
  const sources=[
    ...(/^\d+$/.test(steamId)?[{mode:'wide',url:'https://cdn.cloudflare.steamstatic.com/steam/apps/'+steamId+'/library_hero.jpg'}]:[]),
    ...[cover,fallback].filter((url,index,list)=>url&&list.indexOf(url)===index).map(url=>({mode:'poster',url})),
  ];
  if(!sources.length)return '';
  const [first,...rest]=sources;
  return '<div class="feature-art" aria-hidden="true"><img class="feature-image" alt="" src="'+esc(first.url)+'" data-art-mode="'+first.mode+'" data-art-next="'+
    esc(JSON.stringify(rest))+'"></div>';
}

const banner=(g,inner)=>'<article class="hero">'+((g.cover||g.coverFallback)?'<div class="game-art">'+coverImage(g)+'</div>':'')+'<div class="hero-content"><span class="eyebrow">'+esc(g.system)+'　/　'+esc(t(g.status))+'</span><h2>'+esc(g.title)+'</h2>'+inner+'</div></article>';

const connectionKey = 'checkpoint-connections-v1';
const providers = [
  { id: 'steam', name: 'Steam', label: 'ID Steam (17 cyfr)', url: 'https://steamcommunity.com/my/', description: 'Zaloguj się przez Steam i wybierz gry do importu. Możesz też wkleić listę JSON.' },
  { id: 'xbox', name: 'Xbox', label: 'Gamertag', url: 'https://www.xbox.com/play', description: 'Zaloguj się kontem Microsoft i wybierz gry z historii grania Xbox do importu.' },
  { id: 'ps', name: 'PlayStation', label: 'PSN Online ID', url: 'https://www.playstation.com/', description: 'Zapisz swój identyfikator PSN i wracaj do konta PlayStation.' },
  { id:'nintendo', name:'Nintendo', label:'Pseudonim Nintendo (opcjonalnie)', url:'https://accounts.nintendo.com/', description:'Otwórz oficjalne konto Nintendo albo zapisz lokalny pseudonim.' },
  { id: 'wand', name: 'Wand', label: 'Nazwa profilu (opcjonalnie)', url: 'https://www.wand.com/', description: 'Skrót do Wand. Mapy przypinasz bezpośrednio do kart gier.' },
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
function renderConnections() {
  return pageHeading(t('Połączenia')) + renderConnectionGuide() + '<div class="platform-grid">' + providers.map(provider => {
    const saved = connections[provider.id];
    const isSteam = provider.id === 'steam';
    const hasLibrary=Object.hasOwn(librarySources,provider.id);
    const steamStatus = isSteam && saved?.syncedAt && !saved?.lastImport
      ? '<small>'+t('Ostatnia synchronizacja')+': ' + esc(new Date(saved.syncedAt).toLocaleString(appLocale())) + '</small>'
      : '';
    const mark=provider.id==='nintendo'?'<span class="provider-mark" aria-hidden="true">N</span>':
      '<span class="provider-mark"><img src="assets/'+provider.id+(provider.id==='wand'?'.ico':'.svg')+'" alt="" width="24" height="24"></span>';
    return '<article class="panel platform-card '+provider.id+'"><div class="provider-heading">'+mark+'<div><h2>'+provider.name+'</h2><span class="connection-state'+(saved?' is-saved':'')+'">'+t((saved?.librarySyncedAt||saved?.syncedAt)?'Biblioteka zsynchronizowana':saved?.libraryUrl?'Adres połączenia zapisany':saved?.lastImport?'Biblioteka wczytana':saved?'Profil zapisany':'Do skonfigurowania')+'</span></div></div>' +
      '<p class="muted">' + t(provider.description) + '</p>' +
      (saved?.profile ? '<p class="profile-id">' + esc(saved.profile) + '</p>' : '') +
      '<div class="actions">' + (isSteam ? steamConnectButton(saved) : provider.id==='xbox' ? xboxConnectButton(saved) : btn(saved ? t('Edytuj profil') : t('Dodaj profil'), 'profile-' + provider.id, 'provider-action')) +
      '</div><details class="extra-options"><summary>'+t('Opcje połączenia')+'</summary><div class="actions">' +
      '<a class="button" href="' + provider.url + '" target="_blank" rel="noopener noreferrer">'+(provider.id==='nintendo'?t('Zaloguj się na Nintendo'):t('Otwórz')+' '+provider.name) + '</a>' +
      (provider.id==='xbox'&&saved?.profile?btn(t('Odłącz Xbox'),'xbox-unlink'):'')+(isSteam?btn(t('Pokaż zaimportowane gry'),'source-view:steam')+btn(t('Import Steam JSON'),'import')+(saved?btn(t('Odłącz Steam'),'steam-unlink'):''):'')+
      (hasLibrary?sourceConnectionButtons(provider.id,saved):'')+
      '</div>' + (isSteam && !steamServerAddress() ? '<small>'+t(steamErrorMessage('not_configured'))+'</small>' : '') +
      (hasLibrary?sourceConnectionDetails(provider.id,saved):'')+
      (!isSteam && !hasLibrary ? '<small>'+t(provider.id==='nintendo'?'Logowanie odbywa się na stronie Nintendo. Checkpoint zapisuje pseudonim lokalnie.':'Tryb profilu — bez synchronizacji z kontem.')+'</small>' : '') + steamStatus + '</details>' + (saved?.lastImport?lastImportMarkup(saved):'') +
      (isSteam ? '<p role="status">' + esc(steamMessage) + '</p>' : '') + '</article>';
  }).join('') + '</div>';
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
  const label=xboxBusy?'Łączę konto Xbox…':saved?.profile?'Odśwież z Xbox':'Połącz Xbox';
  return '<button class="primary provider-action" data-act="xbox-sync"'+(xboxBusy||!steamServerAddress()?' disabled':'')+'>'+t(label)+'</button>';
}
function steamConnectButton(saved) {
  const label=steamBusy?'Łączę konto Steam…':saved?'Odśwież bibliotekę':'Połącz Steam';
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

function render(){const g=active(),view=location.hash.slice(1)||'now';document.body.dataset.view=g?'game':view;document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('active',a.hash==='#'+(g?'library':view)));
 if(view==='settings'){app.innerHTML=renderSettings()}
 else if(view==='news'){app.innerHTML=renderNews();loadNews()}
 else if(view==='connections'){app.innerHTML=renderConnections()}
 else if(g){app.innerHTML=renderGameCard(g)}
 else if(view==='library'){app.innerHTML=renderLibrary();renderLibraryResults()}
 else if(view==='rank'){app.innerHTML=renderRankings()}
 else if(!games.length){app.innerHTML=pageHeading(t('Gram teraz'))+'<div class="panel empty-library"><h2>'+t('Twoja biblioteka jest pusta')+'</h2><p class="muted">'+t('Dodaj pierwszą grę albo zaimportuj bibliotekę Steam.')+'</p><div class="actions">'+btn(t('＋ Dodaj grę'),'add','primary')+btn(t('Import Steam JSON'),'import')+'</div></div>'+eveningPanel()}
 else{
   const current=featuredGame();
   const addPlaying=btn(t('＋ Do ogrywanych'),'pick:playing');
   app.innerHTML=pageHeading(t('Gram teraz'),addPlaying)+
     (current?featuredPanel(current):'<p class="panel">'+t('Nie ogrywasz teraz żadnej gry.')+'</p>')+
     eveningPanel()+gameShelf(queuedGames(current));
 }
 paintMedia(g||(view==='now'?featuredGame():null));
 syncSessionVoice();
 if(g && currentGameTab==='ratings')attachCriticScores([g]);
 document.querySelector('.account-link').setAttribute('aria-current',view==='settings'?'page':'false');
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
 if(['wand-maps','stuck','resource-paste'].includes(act)){
   const resourceGame=game||featuredGame();
   if(!resourceGame)return;
   if(act==='wand-maps')openWandMaps(resourceGame);
   else if(act==='stuck')openStuck(resourceGame);
   else openResourcePaste(resourceGame);
   return;
 }
 if(act==='featured-prev'||act==='featured-next'){stepFeatured(act==='featured-next'?1:-1,act);return}
 const [sourceAction,providerId]=act.split(':');
 if(providerId==='steam'||Object.hasOwn(librarySources,providerId)){
   if(sourceAction==='source-view'){
     librarySource=providerId;libraryStatus='';filter='';collection='';platform='';libraryLimit=libraryPageSize;
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
 if(act.startsWith('draw-add:')){const choice=drawnCatalogue[Number(act.slice(9))];if(choice)openGameForm(null,choice);return}
 if(act.startsWith('evening:')){
   const duration=act.slice('evening:'.length);
   if(Object.hasOwn(eveningDurations,duration))openEvening(duration);
   return;
 }
 if(act==='pick:queue'||act==='pick:playing'){openGamePicker(act.slice(5));return}
 if(act==='edit-hint' && game){editSessionHint(game);return}
 if(act==='edit-return' && game){editReturn(game);return}
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
 if(act.startsWith('library-filter:')){
   libraryStatus=act.slice('library-filter:'.length);
   libraryLimit=libraryPageSize;
   for(const button of app.querySelectorAll('.library-chips button')) button.setAttribute('aria-pressed',String(button.dataset.act===act));
   renderLibraryResults();
   return;
 }
 if(['library-view:list','library-view:covers','library-view:groups'].includes(act)){
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
 if(act.startsWith('news-source-')){selectNewsSource(act.slice(12));return}
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
function openGameForm(existing,suggestion) {
  let selectedGame;
  const platform = existing?.system || suggestion?.store || preferences.profile?.platform || systems[0];
  openForm(existing?t('Edytuj grę'):t('Dodaj grę'),
    select(t('Platforma'),'system',systems,platform) +
    input(t('Tytuł'),'title',existing?.title||suggestion?.title,'required maxlength="120" placeholder="'+t('Zacznij wpisywać tytuł…')+'"') +
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
  selectedGame=wireCatalogSearch(existing?.title||suggestion?.title,suggestion);
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
    image.dataset.artMode=next.mode;
    image.dataset.artNext=JSON.stringify(rest);
    image.src=next.url;
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
    const imageRatio=image.naturalWidth/image.naturalHeight;
    const frameRatio=frame.clientWidth/frame.clientHeight;
    const cropFraction=1-Math.min(imageRatio/frameRatio,frameRatio/imageRatio);
    const preserveArtwork=cropFraction>0.12;
    frame.dataset.artwork=preserveArtwork?'full':'cover';
    frame.style.setProperty('--shelf-artwork',preserveArtwork?'url('+JSON.stringify(image.currentSrc||image.src)+')':'none');
  }
  if(!image.matches?.('.feature-art .feature-image'))return;
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
  if(location.hash==='#library'){
    window.scrollTo(0,libraryScroll);
    if(libraryReturnGame){
      [...app.querySelectorAll('#results [data-game]')].find(el=>el.dataset.game===libraryReturnGame)?.focus({preventScroll:true});
      libraryReturnGame=undefined;
    }
  } else {
    window.scrollTo(0,0);
    if(location.hash==='#now')app.scrollTop=0;
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
applyLanguage();render();if(needsOnboarding(preferences))openOnboarding();loadGamePass();attachGenres(games);

resumeSteamLogin();
resumeXboxLogin();
