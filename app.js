const app=document.querySelector('#app'), dialog=document.querySelector('#modal'),form=document.querySelector('#form'),fields=document.querySelector('#fields');
const systems=['Xbox','Steam','PlayStation'],statuses=['Gram','W kolejce','Ukończona'],criteria=['Grywalność','Klimat','Dźwięk','Fabuła','Technikalia'];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
function web(s){try{const u=new URL(s);return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}}
const cdn=id=>'https://cdn.cloudflare.steamstatic.com/steam/apps/'+id+'/library_600x900.jpg';
const run=()=>({progress:0,goal:'',sessions:[]});
function game(title,system,cover='',catalog='Moje gry'){return {id:crypto.randomUUID(),title,system,cover,catalog,status:'W kolejce',runs:{[system]:run()},scores:[],maps:[],tasks:[]}}
function examples(){const games=[['GTA: Vice City',1546990,'Xbox'],['Elden Ring',1245620,'Steam'],['Cyberpunk 2077',1091500,'Xbox'],['Hades',1145360,'Steam'],['God of War',1593500,'PlayStation']].map(([t,id,p])=>game(t,p,cdn(id),'Na start'));games[0].status='Gram';return games}
const key='checkpoint-diary-v1';let games=JSON.parse(localStorage.getItem(key)||'null')??examples(),filter='',collection='',platform='';
function persist(){localStorage.setItem(key,JSON.stringify(games))}
persist();
const score=g=>{const a=g.scores.filter(Number.isFinite);return a.length?(a.reduce((a,b)=>a+b,0)/a.length):null};
const btn=(label,act,cls='')=>'<button class="'+cls+'" data-act="'+act+'">'+label+'</button>';
const options=(arr,v)=>arr.map(s=>'<option '+(s===v?'selected':'')+'>'+esc(s)+'</option>').join('');
const bar=p=>'<div class="bar"><i style="width:'+Number(p)+'%"></i></div>';
const grid=a=>'<div class="grid">'+a.map(g=>'<button class="tile" data-game="'+g.id+'"><span class="cover"><b>'+esc(g.title)+'</b>'+(web(g.cover)?'<img loading="lazy" alt="" src="'+esc(web(g.cover))+'" onerror="this.hidden=true;this.style.display=\'none\'">':'')+'</span><span class="info"><strong>'+esc(g.title)+'</strong><small>'+esc(Object.keys(g.runs).join(' · '))+'</small></span></button>').join('')+'</div>';
const pageHeading=(title,action='')=>'<div class="top"><h1>'+esc(title)+'</h1>'+action+'</div>';
const section=s=>'<div class="section"><h2>'+s+'</h2></div>';
const active=()=>games.find(g=>'#game-'+g.id===location.hash);
const banner=(g,inner,feature=false)=>'<article class="hero'+(feature?' hero-feature':'')+'"><div><span class="eyebrow">'+esc(g.system)+'　/　'+esc(g.status)+'</span><h2>'+esc(g.title)+'</h2>'+inner+'</div></article>';

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
  return pageHeading('Połączenia') + '<div class="platform-grid">' + providers.map(provider => {
    const saved = connections[provider.id];
    const isSteam = provider.id === 'steam';
    const steamStatus = isSteam && saved?.syncedAt
      ? '<small>Ostatnia synchronizacja: ' + esc(new Date(saved.syncedAt).toLocaleString('pl-PL')) + '</small>'
      : '';
    return '<article class="panel platform-card '+provider.id+'"><div class="provider-heading"><span class="provider-mark"><img src="assets/'+provider.id+(provider.id==='wand'?'.ico':'.svg')+'" alt="" width="24" height="24"></span><div><h2>'+provider.name+'</h2><span class="connection-state'+(saved?' is-saved':'')+'">'+(saved?'Profil zapisany':'Do skonfigurowania')+'</span></div></div>' +
      '<p class="muted">' + provider.description + '</p>' +
      (saved?.profile ? '<p class="profile-id">' + esc(saved.profile) + '</p>' : '') +
      '<div class="actions">' + btn(saved ? 'Edytuj profil' : 'Dodaj profil', 'profile-' + provider.id, 'provider-action') +
      '<a class="button" href="' + provider.url + '" target="_blank" rel="noopener noreferrer">Otwórz ' + provider.name + '</a>' +
      (isSteam && saved?.server ? '<button class="primary" data-act="steam-sync"' + (steamBusy ? ' disabled' : '') + '>Odśwież bibliotekę</button>' : '') +
      '</div>' + (isSteam && !saved?.server ? '<small>Import online wymaga adresu serwera Steam.</small>' : '') +
      (!isSteam ? '<small>Tryb profilu — bez synchronizacji z kontem.</small>' : '') + steamStatus +
      (isSteam ? '<p role="status">' + esc(steamMessage) + '</p>' : '') + '</article>';
  }).join('') + '</div>';
}
function editConnection(provider) {
  const saved = connections[provider.id];
  const isSteam = provider.id === 'steam';
  const nameRules = isSteam ? 'required inputmode="numeric" pattern="[0-9]{17}"' : 'maxlength="80"';
  openForm(provider.name, input(provider.label, 'profile', saved?.profile, nameRules) +
    (isSteam ? input('Adres serwera Steam', 'server', saved?.server, 'type="url" placeholder="https://…"') : '') +
    (saved ? '<label><span><input type="checkbox" name="unlink"> Usuń zapisany profil</span></label>' : ''), data => {
      if (data.has('unlink')) {
        delete connections[provider.id];
      } else {
        const profile = data.get('profile').trim();
        if (!profile && provider.id !== 'wand') throw Error('Wpisz identyfikator profilu.');
        const server = data.get('server')?.trim() || '';
        if (server && !web(server).startsWith('https://')) throw Error('Adres serwera musi zaczynać się od https://.');
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
  steamMessage = 'Pobieram bibliotekę…';
  if (location.hash === '#connections') render();
  try {
    const url = new URL(saved.server);
    url.searchParams.set('steamid', saved.profile);
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error('Serwer Steam zwrócił błąd (' + response.status + '). Sprawdź adres i widoczność biblioteki.');
    const data = await response.json();
    if (connections.steam !== saved) return;
    const count = importSteamGames(data);
    persist();
    saved.syncedAt = new Date().toISOString();
    localStorage.setItem(connectionKey, JSON.stringify(connections));
    steamMessage = 'Zaktualizowano gry Steam: ' + count + '.';
  } catch (error) {
    steamMessage = error.message || 'Nie udało się pobrać gier.';
  } finally {
    steamBusy = false;
    if (['#connections', '#library', '#now', ''].includes(location.hash)) render();
  }
}
function importSteamGames(data) {
  const items = data?.response?.games ?? data?.games;
  if (!Array.isArray(items)) throw Error('Brak dostępnej listy gier Steam.');
  const valid = items.filter(item => typeof item?.name === 'string' && item.name.trim() && Number.isInteger(item.appid));
  if (items.length && !valid.length) throw Error('Lista Steam nie zawiera tytułów i identyfikatorów gier.');
  for (const entry of valid) {
    let item = games.find(g => g.steamAppId === entry.appid) ||
      games.find(g => !g.steamAppId && g.title.toLowerCase() === entry.name.toLowerCase());
    if (!item) {
      item = game(entry.name, 'Steam', cdn(entry.appid), 'Steam');
      games.push(item);
    }
    item.steamAppId = entry.appid;
    item.runs.Steam ??= run();
    if (Number.isFinite(entry.playtime_forever)) item.runs.Steam.importedMinutes = entry.playtime_forever;
  }
  return valid.length;
}

function catalogGrid(){const a=games.filter(g=>g.title.toLocaleLowerCase().includes(filter.toLocaleLowerCase())&&(!collection||collection===g.catalog)&&(!platform||g.runs[platform]));document.querySelector('#results').innerHTML=a.length?grid(a):'<p>Brak gier dla tego wyboru.</p>'}
function render(){const g=active(),view=location.hash.slice(1)||'now';document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('active',a.hash==='#'+(g?'library':view)));
 if(view==='settings'){app.innerHTML=renderSettings()}
 else if(view==='news'){app.innerHTML=renderNews();loadNews()}
 else if(view==='connections'){app.innerHTML=renderConnections()}
 else if(g){const r=g.runs[g.system];app.innerHTML=pageHeading('Karta gry',btn('Edytuj','edit'))+banner(g,'<p>'+esc(g.catalog)+'</p>'+btn('Zapisz sesję','session','primary'))+'<div class="panel"><div class="row"><h2>Przejście</h2><select aria-label="Platforma przejścia" id="system">'+options(Object.keys(g.runs),g.system)+'</select></div>'+bar(r.progress)+'<strong>'+r.progress+'%</strong> · '+r.sessions.reduce((n,s)=>n+s.minutes,0)+' min zapisanych'+(Number.isFinite(r.importedMinutes)?' · '+r.importedMinutes+' min w Steam':'')+'<p>'+esc(r.goal||'Zapisz kolejny cel po sesji.')+'</p></div>'+section('Mapy i cele')+'<div class="actions">'+btn('＋ Dodaj mapę','map')+btn('＋ Dodaj cel','task')+'</div>'+g.maps.map(m=>'<a class="entry" href="'+esc(web(m.url))+'" rel="noopener noreferrer" target="_blank">'+esc(m.name)+'</a>').join('')+g.tasks.map((t,i)=>'<label class="entry"><input type="checkbox" data-task="'+i+'" '+(t.done?'checked':'')+'>'+esc(t.name)+'</label>').join('')+section('Twoja ocena')+'<div class="panel row"><span class="number">'+(score(g)?.toFixed(1)??'—')+' / 10</span>'+btn('Oceń grę','rate')+'</div>'+section('Dziennik sesji')+(r.sessions.length?r.sessions.slice().reverse().map(s=>'<div class="panel"><strong>'+esc(s.date)+' · '+s.minutes+' min</strong><p>'+esc(s.note)+'</p></div>').join(''):'<p class="muted">Tutaj pojawi się pierwsza zapisana sesja.</p>')}
 else if(view==='library'){app.innerHTML=pageHeading('Biblioteka',btn('＋ Dodaj grę','add','primary'))+'<div class="filters"><input id="search" aria-label="Szukaj gry" placeholder="Szukaj gry…" value="'+esc(filter)+'"><select id="catalog" aria-label="Katalog"><option value="">Wszystkie katalogi</option>'+options([...new Set(games.map(g=>g.catalog))],collection)+'</select><select id="platform" aria-label="Filtr platformy"><option value="">Wszystkie platformy</option>'+options(systems,platform)+'</select>'+btn('Import Steam JSON','import')+'</div><div id="results"></div>';catalogGrid()}
 else if(view==='rank'){let ranked=games.filter(g=>score(g)!==null).sort((a,b)=>score(b)-score(a));app.innerHTML=pageHeading('Ranking')+(ranked.map((g,i)=>'<button class="entry" data-game="'+g.id+'"><span class="number">'+(i+1)+'</span><strong>'+esc(g.title)+'</strong>'+score(g).toFixed(1)+' / 10</button>').join('')||'<div class="panel"><h2>Jaką grę oceniasz najwyżej?</h2><p>Wybierz grę z biblioteki i oceń ją, aby rozpocząć ranking.</p><a href="#library" class="button" style="display:inline-block;margin-top:12px">Wybierz grę</a></div>')}
 else{const current=games.find(g=>g.status==='Gram');app.innerHTML=pageHeading('Gram teraz',btn('＋ Dodaj grę','add'))+(current?banner(current,'<p>'+esc(current.runs[current.system].goal||'Następny cel czeka na zapisanie.')+'</p><div class="actions">'+btn('＋ Zapisz sesję','quick','primary')+'<button data-game="'+current.id+'">Karta gry</button></div>',true):'<div class="panel">Wybierz w karcie gry status „Gram”.</div>')+'<div class="section"><h2>Na półce</h2><a class="button" href="#library">Biblioteka</a></div>'+grid(games.filter(x=>x!==current).slice(0,5))}
 document.querySelector('.account-link').setAttribute('aria-current',view==='settings'?'page':'false');
 for(const link of document.querySelectorAll('nav a')) {
   if(link.classList.contains('active')) link.setAttribute('aria-current','page');
   else link.removeAttribute('aria-current');
 }
}
const input=(label,name,val='',attr='')=>'<label>'+label+'<input name="'+name+'" value="'+esc(val)+'" '+attr+'></label>';
const select=(label,name,arr,val)=>'<label>'+label+'<select name="'+name+'">'+options(arr,val)+'</select></label>';
let saveAction;
function openForm(title,body,action){fields.innerHTML='<h2 id="dialog-title">'+title+'</h2>'+body;saveAction=action;form.onsubmit=submitForm;dialog.showModal()}
document.querySelector('#close').onclick=()=>dialog.close();
const submitForm=e=>{e.preventDefault();try{saveAction(new FormData(form));persist();dialog.close();render()}catch(err){alert(err.message)}};
function action(act){
 if(act==='edit-account'){editAccount();return}
 if(act==='edit-weather'){editWeather();return}
 if(act==='force-update'){forceUpdate();return}
 if(act==='refresh-news'){loadNews(true);return}
 if(act.startsWith('news-source-')){selectNewsSource(act.slice(12));return}
 const provider=providers.find(p=>act==='profile-'+p.id);
 if(provider){editConnection(provider);return}
 if(act==='steam-sync'){syncSteam();return}
 let g=active();if(act==='quick')g=games.find(g=>g.status==='Gram');
 if(['add','edit'].includes(act)){openForm(g?'Edytuj grę':'Dodaj grę',input('Tytuł','title',g?.title,'required maxlength="120"')+select('Platforma','system',systems,g?.system)+input('Katalog','catalog',g?.catalog||'Moje gry','required')+select('Status','status',statuses,g?.status)+input('Adres okładki','cover',g?.cover,'type="url"'),d=>{const title=d.get('title').trim(),p=d.get('system');if(!title)throw Error('Wpisz tytuł.');const item=g||games.find(x=>x.title.toLowerCase()===title.toLowerCase())||game(title,p);Object.assign(item,{title,system:p,status:d.get('status'),catalog:d.get('catalog').trim()||'Moje gry',cover:web(d.get('cover'))||item.cover});item.runs[p]??=run();if(!games.includes(item))games.push(item);location.hash='game-'+item.id});return}
 if(act==='import'){openForm('Import biblioteki Steam','<label>Wklej JSON z listą gier Steam (GetOwnedGames)<textarea name="json" required rows="6"></textarea></label>',d=>importSteamGames(JSON.parse(d.get('json'))));return}
 if(!g)return;const r=g.runs[g.system];
 if(['session','quick'].includes(act))openForm('Zapisz sesję',input('Czas gry (min)','minutes',30,'type="number" min="1" max="1440" required')+input('Postęp (%)','progress',r.progress,'type="number" min="0" max="100" required')+input('Co udało się zrobić?','note')+input('Następny cel','goal',r.goal),d=>{r.sessions.push({date:new Date().toLocaleDateString('pl-PL'),minutes:Number(d.get('minutes')),note:d.get('note')});r.goal=d.get('goal');r.progress=Number(d.get('progress'));if(act==='quick')location.hash='game-'+g.id});
 if(act==='rate')openForm('Oceń grę','<p class="muted">Skala 1–10. Puste kategorie pomijamy w średniej.</p>'+criteria.map((c,i)=>input(c,'c'+i,g.scores[i]??'','type="number" min="1" max="10"')).join(''),d=>g.scores=criteria.map((_,i)=>d.get('c'+i)?Number(d.get('c'+i)):null));
 if(act==='map')openForm('Przypnij mapę',input('Nazwa mapy','name','Mapa Wand','required')+input('Link do mapy Wand lub innej strony','url','','type="url" required'),d=>{const url=web(d.get('url'));if(!url)throw Error('Wpisz adres https lub http.');g.maps.push({name:d.get('name'),url})});
 if(act==='task')openForm('Nowy cel',input('Co chcesz zrobić?','name','','required'),d=>g.tasks.push({name:d.get('name'),done:false}))}
app.onclick=e=>{const b=e.target.closest('button');if(b?.dataset.game)location.hash='game-'+b.dataset.game;else if(b?.dataset.act)action(b.dataset.act)};
app.oninput=e=>{if(e.target.id==='search'){filter=e.target.value;catalogGrid()}};
app.onchange=e=>{const t=e.target;if(t.id==='catalog'){collection=t.value;catalogGrid()}if(t.id==='platform'){platform=t.value;catalogGrid()}if(t.id==='system'){active().system=t.value;persist();render()}if(t.dataset.task!==undefined){active().tasks[Number(t.dataset.task)].done=t.checked;persist()}};
window.onhashchange=()=>{render();window.scrollTo(0,0)};render();loadWeather();

const steamRefreshInterval = 24 * 60 * 60 * 1000;
if (connections.steam?.server && Date.now() - (Date.parse(connections.steam.syncedAt) || 0) >= steamRefreshInterval) {
  syncSteam();
}
