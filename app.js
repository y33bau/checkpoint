const app=document.querySelector('#app'), dialog=document.querySelector('#modal'),form=document.querySelector('#form'),fields=document.querySelector('#fields');
const systems=['Xbox','Steam','PlayStation'],statuses=['Gram','W kolejce','Ukończona'],criteria=['Grywalność','Klimat','Dźwięk','Fabuła','Technikalia'];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
function web(s){try{const u=new URL(s);return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}}
const cdn=id=>'https://cdn.cloudflare.steamstatic.com/steam/apps/'+id+'/library_600x900.jpg';
const steamHeader=id=>'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/'+id+'/header.jpg';
const run=()=>({progress:0,goal:'',sessions:[]});
function game(title,system,cover='',catalog='Moje gry'){return {id:crypto.randomUUID(),title,system,cover,catalog,status:'W kolejce',runs:{[system]:run()},scores:[],maps:[],tasks:[]}}
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
const grid=a=>'<div class="grid">'+a.map(g=>'<button class="tile" data-game="'+g.id+'"><span class="cover"><b>'+esc(g.title)+'</b>'+coverImage(g)+'</span><span class="info"><strong>'+esc(g.title)+'</strong><small>'+esc(Object.keys(g.runs).join(' · '))+'</small></span></button>').join('')+'</div>';
const pageHeading=(title,action='')=>'<div class="top"><h1>'+esc(title)+'</h1>'+action+'</div>';
const section=s=>'<div class="section"><h2>'+s+'</h2></div>';
const active=()=>games.find(g=>'#game-'+g.id===location.hash);
const banner=(g,inner,feature=false)=>'<article class="hero'+(feature?' hero-feature':'')+'">'+(!feature&&(g.cover||g.coverFallback)?'<div class="game-art">'+coverImage(g)+'</div>':'')+'<div class="hero-content"><span class="eyebrow">'+esc(g.system)+'　/　'+esc(t(g.status))+'</span><h2>'+esc(g.title)+'</h2>'+inner+'</div></article>';

const connectionKey = 'checkpoint-connections-v1';
const providers = [
  { id: 'xbox', name: 'Xbox', label: 'Gamertag', url: 'https://www.xbox.com/play', description: 'Zapisz gamertag i wracaj do swojego konta Xbox.' },
  { id: 'steam', name: 'Steam', label: 'SteamID64', url: 'https://steamcommunity.com/my/', description: 'Zapisz SteamID64, aby odświeżać bibliotekę z podłączonego serwera.' },
  { id: 'wand', name: 'Wand', label: 'Nazwa profilu (opcjonalnie)', url: 'https://www.wand.com/', description: 'Skrót do Wand. Mapy przypinasz bezpośrednio do kart gier.' },
  { id: 'ps', name: 'PlayStation', label: 'PSN Online ID', url: 'https://www.playstation.com/', description: 'Zapisz swój identyfikator PSN i wracaj do konta PlayStation.' },
];
let connections = {};
try {
  connections = JSON.parse(localStorage.getItem(connectionKey) || '{}') || {};
} catch {
  connections = {};
}
let steamBusy = false;
let steamMessage = '';
function renderConnections() {
  return pageHeading(t('Połączenia')) + '<div class="platform-grid">' + providers.map(provider => {
    const saved = connections[provider.id];
    const isSteam = provider.id === 'steam';
    const steamStatus = isSteam && saved?.syncedAt
      ? '<small>'+t('Ostatnia synchronizacja')+': ' + esc(new Date(saved.syncedAt).toLocaleString(appLocale())) + '</small>'
      : '';
    return '<article class="panel platform-card '+provider.id+'"><div class="provider-heading"><span class="provider-mark"><img src="assets/'+provider.id+(provider.id==='wand'?'.ico':'.svg')+'" alt="" width="24" height="24"></span><div><h2>'+provider.name+'</h2><span class="connection-state'+(saved?' is-saved':'')+'">'+(saved?t('Profil zapisany'):t('Do skonfigurowania'))+'</span></div></div>' +
      '<p class="muted">' + t(provider.description) + '</p>' +
      (saved?.profile ? '<p class="profile-id">' + esc(saved.profile) + '</p>' : '') +
      '<div class="actions">' + btn(saved ? t('Edytuj profil') : t('Dodaj profil'), 'profile-' + provider.id, 'provider-action') +
      '<a class="button" href="' + provider.url + '" target="_blank" rel="noopener noreferrer">'+t('Otwórz')+' ' + provider.name + '</a>' +
      (isSteam && saved?.server ? '<button class="primary" data-act="steam-sync"' + (steamBusy ? ' disabled' : '') + '>'+t('Odśwież bibliotekę')+'</button>' : '') +
      '</div>' + (isSteam && !saved?.server ? '<small>'+t('Import online wymaga adresu serwera Steam.')+'</small>' : '') +
      (!isSteam ? '<small>'+t('Tryb profilu — bez synchronizacji z kontem.')+'</small>' : '') + steamStatus +
      (isSteam ? '<p role="status">' + esc(steamMessage) + '</p>' : '') + '</article>';
  }).join('') + '</div>';
}
function editConnection(provider) {
  const saved = connections[provider.id];
  const isSteam = provider.id === 'steam';
  const nameRules = isSteam ? 'required inputmode="numeric" pattern="[0-9]{17}"' : 'maxlength="80"';
  openForm(provider.name, input(t(provider.label), 'profile', saved?.profile, nameRules) +
    (isSteam ? input(t('Adres serwera Steam'), 'server', saved?.server, 'type="url" placeholder="https://…"') : '') +
    (saved ? '<label><span><input type="checkbox" name="unlink"> '+t('Usuń zapisany profil')+'</span></label>' : ''), data => {
      if (data.has('unlink')) {
        delete connections[provider.id];
      } else {
        const profile = data.get('profile').trim();
        if (!profile && provider.id !== 'wand') throw Error(t('Wpisz identyfikator profilu.'));
        const server = data.get('server')?.trim() || '';
        if (server && !web(server).startsWith('https://')) throw Error(t('Adres serwera musi zaczynać się od https://.'));
        connections[provider.id] = { profile, server, syncedAt: saved?.profile === profile && saved?.server === server ? saved.syncedAt : null };
      }
      localStorage.setItem(connectionKey, JSON.stringify(connections));
      steamMessage = '';
    });
  if (saved && isSteam) {
    const profileInput = form.elements.profile;
    form.elements.unlink.onchange = event => { profileInput.disabled = event.target.checked; };
  }
}
async function syncSteam() {
  const saved = connections.steam;
  if (!saved?.server || steamBusy) return;
  steamBusy = true;
  steamMessage = t('Pobieram bibliotekę…');
  if (location.hash === '#connections') render();
  try {
    const url = new URL(saved.server);
    url.searchParams.set('steamid', saved.profile);
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error(t('Serwer Steam zwrócił błąd')+' (' + response.status + '). '+t('Sprawdź adres i widoczność biblioteki.'));
    const data = await response.json();
    if (connections.steam !== saved) return;
    const count = importSteamGames(data);
    persist();
    saved.syncedAt = new Date().toISOString();
    localStorage.setItem(connectionKey, JSON.stringify(connections));
    steamMessage = t('Zaktualizowano gry Steam')+': ' + count + '.';
  } catch (error) {
    steamMessage = error.message || t('Nie udało się pobrać gier.');
  } finally {
    steamBusy = false;
    if (['#connections', '#library', '#now', ''].includes(location.hash)) render();
  }
}
function importSteamGames(data) {
  const items = data?.response?.games ?? data?.games;
  if (!Array.isArray(items)) throw Error(t('Brak dostępnej listy gier Steam.'));
  const valid = items.filter(item => typeof item?.name === 'string' && item.name.trim() && Number.isInteger(item.appid));
  if (items.length && !valid.length) throw Error(t('Lista Steam nie zawiera tytułów i identyfikatorów gier.'));
  for (const entry of valid) {
    let item = games.find(g => g.steamAppId === entry.appid) ||
      games.find(g => !g.steamAppId && g.title.toLowerCase() === entry.name.toLowerCase());
    if (!item) {
      item = game(entry.name, 'Steam', cdn(entry.appid), 'Steam');
      games.push(item);
    }
    item.steamAppId = entry.appid;
    item.cover ||= cdn(entry.appid);
    item.coverFallback ||= steamHeader(entry.appid);
    item.runs.Steam ??= run();
    if (Number.isFinite(entry.playtime_forever)) item.runs.Steam.importedMinutes = entry.playtime_forever;
  }
  return valid.length;
}

function catalogGrid(){const a=games.filter(g=>g.title.toLocaleLowerCase().includes(filter.toLocaleLowerCase())&&(!collection||collection===g.catalog)&&(!platform||g.runs[platform]));document.querySelector('#results').innerHTML=a.length?grid(a):'<p>'+t('Brak gier dla tego wyboru.')+'</p>'}
function render(){const g=active(),view=location.hash.slice(1)||'now';document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('active',a.hash==='#'+(g?'library':view)));
 if(view==='settings'){app.innerHTML=renderSettings()}
 else if(view==='news'){app.innerHTML=renderNews();loadNews()}
 else if(view==='connections'){app.innerHTML=renderConnections()}
 else if(g){const r=g.runs[g.system];app.innerHTML=pageHeading(t('Karta gry'),btn(t('Edytuj'),'edit'))+banner(g,'<p>'+esc(g.catalog)+'</p>'+btn(t('Zapisz sesję'),'session','primary'))+'<div class="panel"><div class="row"><h2>'+t('Przejście')+'</h2><select aria-label="'+t('Platforma przejścia')+'" id="system">'+options(Object.keys(g.runs),g.system)+'</select></div>'+bar(r.progress)+'<strong>'+r.progress+'%</strong> · '+r.sessions.reduce((n,s)=>n+s.minutes,0)+' '+t('min zapisanych')+(Number.isFinite(r.importedMinutes)?' · '+r.importedMinutes+' '+t('min w Steam'):'')+'<p>'+esc(r.goal||t('Zapisz kolejny cel po sesji.'))+'</p></div>'+section(t('Mapy i cele'))+'<div class="actions">'+btn(t('＋ Dodaj mapę'),'map')+btn(t('＋ Dodaj cel'),'task')+'</div>'+g.maps.map(m=>'<a class="entry" href="'+esc(web(m.url))+'" rel="noopener noreferrer" target="_blank">'+esc(m.name)+'</a>').join('')+g.tasks.map((t,i)=>'<label class="entry"><input type="checkbox" data-task="'+i+'" '+(t.done?'checked':'')+'>'+esc(t.name)+'</label>').join('')+section(t('Twoja ocena'))+'<div class="panel row"><span class="number">'+(score(g)?.toFixed(1)??'—')+' / 10</span>'+btn(t('Oceń grę'),'rate')+'</div>'+section(t('Dziennik sesji'))+(r.sessions.length?r.sessions.slice().reverse().map(s=>'<div class="panel"><strong>'+esc(s.date)+' · '+s.minutes+' min</strong><p>'+esc(s.note)+'</p></div>').join(''):'<p class="muted">'+t('Tutaj pojawi się pierwsza zapisana sesja.')+'</p>')}
 else if(view==='library'){app.innerHTML=pageHeading(t('Biblioteka'),btn(t('＋ Dodaj grę'),'add','primary'))+'<div class="filters"><input id="search" aria-label="'+t('Szukaj gry')+'" placeholder="'+t('Szukaj gry…')+'" value="'+esc(filter)+'"><select id="catalog" aria-label="'+t('Katalog')+'"><option value="">'+t('Wszystkie katalogi')+'</option>'+options([...new Set(games.map(g=>g.catalog))],collection)+'</select><select id="platform" aria-label="'+t('Filtr platformy')+'"><option value="">'+t('Wszystkie platformy')+'</option>'+options(systems,platform)+'</select>'+btn(t('Import Steam JSON'),'import')+'</div><div id="results"></div>';catalogGrid()}
 else if(view==='rank'){let ranked=games.filter(g=>score(g)!==null).sort((a,b)=>score(b)-score(a));app.innerHTML=pageHeading(t('Ranking'))+(ranked.map((g,i)=>'<button class="entry" data-game="'+g.id+'"><span class="number">'+(i+1)+'</span><strong>'+esc(g.title)+'</strong>'+score(g).toFixed(1)+' / 10</button>').join('')||'<div class="panel"><h2>'+t('Jaką grę oceniasz najwyżej?')+'</h2><p>'+t('Wybierz grę z biblioteki i oceń ją, aby rozpocząć ranking.')+'</p><a href="#library" class="button" style="display:inline-block;margin-top:12px">'+t('Wybierz grę')+'</a></div>')}
 else if(!games.length){app.innerHTML=pageHeading(t('Gram teraz'))+'<div class="panel empty-library"><h2>'+t('Twoja biblioteka jest pusta')+'</h2><p class="muted">'+t('Dodaj pierwszą grę albo zaimportuj bibliotekę Steam.')+'</p><div class="actions">'+btn(t('＋ Dodaj grę'),'add','primary')+btn(t('Import Steam JSON'),'import')+'</div></div>'}
 else{const current=games.find(g=>g.status==='Gram');app.innerHTML=pageHeading(t('Gram teraz'),btn(t('＋ Dodaj grę'),'add'))+(current?banner(current,'<p>'+esc(current.runs[current.system].goal||t('Następny cel czeka na zapisanie.'))+'</p><div class="actions">'+btn(t('＋ Zapisz sesję'),'quick','primary')+'<button data-game="'+current.id+'">'+t('Karta gry')+'</button></div>',true):'<div class="panel">'+t('Wybierz w karcie gry status „Gram”.')+'</div>')+'<div class="section"><h2>'+t('Na półce')+'</h2><a class="button" href="#library">'+t('Biblioteka')+'</a></div>'+grid(games.filter(x=>x!==current).slice(0,5))}
 document.querySelector('.account-link').setAttribute('aria-current',view==='settings'?'page':'false');
 for(const link of document.querySelectorAll('nav a')) {
   if(link.classList.contains('active')) link.setAttribute('aria-current','page');
   else link.removeAttribute('aria-current');
 }
}
const input=(label,name,val='',attr='')=>'<label>'+label+'<input name="'+name+'" value="'+esc(val)+'" '+attr+'></label>';
const select=(label,name,arr,val,optionLabel)=>'<label>'+label+'<select name="'+name+'">'+options(arr,val,optionLabel)+'</select></label>';
let saveAction;
function openForm(title,body,action){fields.innerHTML='<h2 id="dialog-title">'+title+'</h2>'+body;saveAction=action;form.onsubmit=submitForm;dialog.showModal()}
document.querySelector('#close').onclick=()=>dialog.close();
const submitForm=e=>{e.preventDefault();try{saveAction(new FormData(form));persist();dialog.close();render()}catch(err){alert(err.message)}};
function action(act){
 if(act==='save-local-settings'){saveLocalSettings();return}
 if(act==='clear-local-data'){clearLocalData();return}
 if(act==='edit-account'){editAccount();return}
 if(act==='edit-weather'){editWeather();return}
 if(act==='force-update'){forceUpdate();return}
 if(act==='refresh-news'){loadNews(true);return}
 if(act.startsWith('news-source-')){selectNewsSource(act.slice(12));return}
 const provider=providers.find(p=>act==='profile-'+p.id);
 if(provider){editConnection(provider);return}
 if(act==='steam-sync'){syncSteam();return}
 let g=active();if(act==='quick')g=games.find(g=>g.status==='Gram');
 if(['add','edit'].includes(act)){openGameForm(g);return}
 if(act==='import'){openForm(t('Import biblioteki Steam'),'<label>'+t('Wklej JSON z listą gier Steam (GetOwnedGames)')+'<textarea name="json" required rows="6"></textarea></label>',d=>importSteamGames(JSON.parse(d.get('json'))));return}
 if(!g)return;const r=g.runs[g.system];
 if(['session','quick'].includes(act))openForm(t('Zapisz sesję'),input(t('Czas gry (min)'),'minutes',30,'type="number" min="1" max="1440" required')+input(t('Postęp (%)'),'progress',r.progress,'type="number" min="0" max="100" required')+input(t('Co udało się zrobić?'),'note')+input(t('Następny cel'),'goal',r.goal),d=>{r.sessions.push({date:new Date().toLocaleDateString(appLocale()),minutes:Number(d.get('minutes')),note:d.get('note')});r.goal=d.get('goal');r.progress=Number(d.get('progress'));if(act==='quick')location.hash='game-'+g.id});
 if(act==='rate')openForm(t('Oceń grę'),'<p class="muted">'+t('Skala 1–10. Puste kategorie pomijamy w średniej.')+'</p>'+criteria.map((c,i)=>input(t(c),'c'+i,g.scores[i]??'','type="number" min="1" max="10"')).join(''),d=>g.scores=criteria.map((_,i)=>d.get('c'+i)?Number(d.get('c'+i)):null));
 if(act==='map')openForm(t('Przypnij mapę'),input(t('Nazwa mapy'),'name',t('Mapa Wand'),'required')+input(t('Link do mapy Wand lub innej strony'),'url','','type="url" required'),d=>{const url=web(d.get('url'));if(!url)throw Error(t('Wpisz adres https lub http.'));g.maps.push({name:d.get('name'),url})});
 if(act==='task')openForm(t('Nowy cel'),input(t('Co chcesz zrobić?'),'name','','required'),d=>g.tasks.push({name:d.get('name'),done:false}))}
function openGameForm(existing) {
  let selectedGame;
  const platform = existing?.system || preferences.profile?.platform || systems[0];
  openForm(existing?t('Edytuj grę'):t('Dodaj grę'),
    select(t('Platforma'),'system',systems,platform) +
    input(t('Tytuł'),'title',existing?.title,'required maxlength="120" placeholder="'+t('Zacznij wpisywać tytuł…')+'"') +
    '<div id="catalog-results" class="catalog-results" role="listbox" aria-label="'+t('Podpowiedzi gier')+'" hidden></div>' +
    '<p id="catalog-status" class="muted" role="status"></p>' +
    input(t('Katalog'),'catalog',existing?.catalog||'Moje gry','required') +
    select(t('Status'),'status',statuses,existing?.status,t), data=>{
      const typedTitle = data.get('title').trim();
      if (!typedTitle) throw Error(t('Wpisz tytuł.'));
      const store = data.get('system');
      const choice = selectedGame();
      const item = existing || games.find(entry=>entry.title.toLowerCase()===typedTitle.toLowerCase()) || game(typedTitle,store);
      const renamed = item.title!==typedTitle;
      Object.assign(item,{title:typedTitle,system:store,status:data.get('status'),catalog:data.get('catalog').trim()||'Moje gry'});
      item.runs[store] ??= run();
      if (renamed && !item.steamAppId) {
        item.cover='';
        item.coverFallback='';
      }
      if (choice && (!item.cover || (renamed && !item.steamAppId))) useCatalogCover(item,choice);
      if (!games.includes(item)) games.push(item);
      if (!choice && !item.cover) fillExactCover(item,typedTitle,store);
      location.hash='game-'+item.id;
    });
  selectedGame=wireCatalogSearch(existing?.title);
}

async function fillExactCover(game, title, store) {
  try {
    const [choice] = await findCatalogGames(title,store,true);
    if (!choice || !games.includes(game) || game.title!==title || game.system!==store || game.cover) return;
    useCatalogCover(game,choice);
    persist();
    if (!dialog.open) render();
  } catch {
    // The game stays in the library if its catalogue is unavailable.
  }
}

app.addEventListener('error',event=>{
  const image=event.target;
  if (!image.matches?.('.cover img, .game-art img')) return;
  const fallback=image.dataset.coverFallback;
  if (fallback) {
    image.dataset.coverFallback='';
    image.src=fallback;
  } else {
    image.remove();
  }
},true);
app.onclick=e=>{const b=e.target.closest('button');if(b?.dataset.game)location.hash='game-'+b.dataset.game;else if(b?.dataset.act)action(b.dataset.act)};
app.oninput=e=>{if(e.target.id==='search'){filter=e.target.value;catalogGrid()}};
app.onchange=e=>{const t=e.target;if(t.id==='app-language'){changeAppLanguage(t.value);return}if(t.id==='catalog'){collection=t.value;catalogGrid()}if(t.id==='platform'){platform=t.value;catalogGrid()}if(t.id==='system'){active().system=t.value;persist();render()}if(t.dataset.task!==undefined){active().tasks[Number(t.dataset.task)].done=t.checked;persist()}};
window.onhashchange=()=>{render();window.scrollTo(0,0)};applyLanguage();render();loadWeather();

const steamRefreshInterval = 24 * 60 * 60 * 1000;
if (connections.steam?.server && Date.now() - (Date.parse(connections.steam.syncedAt) || 0) >= steamRefreshInterval) {
  syncSteam();
}
