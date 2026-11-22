const settingsKey = 'checkpoint-settings-v1';
let preferences = {};
try {
  preferences = JSON.parse(localStorage.getItem(settingsKey) || '{}') || {};
} catch {
  preferences = {};
}

function savePreferences() {
  localStorage.setItem(settingsKey, JSON.stringify(preferences));
}

function renderSettings() {
  const profile = preferences.profile || {};
  return pageHeading(t('Ustawienia')) + `
    <div class="settings-grid">
      <article class="panel settings-card">
        <h2 id="app-language-title">${t('Język aplikacji')}</h2>
        <label><select id="app-language" aria-labelledby="app-language-title">
          <option value="pl" ${appLanguage() === 'pl' ? 'selected' : ''}>PL · Polski</option>
          <option value="en" ${appLanguage() === 'en' ? 'selected' : ''}>ENG · English</option>
        </select></label>
        <small>${t('Język zmienia interfejs i źródła wiadomości.')}</small>
      </article>
      <article class="panel settings-card"><h2>${t('Twój profil')}</h2>
        <p>${esc(profile.name || t('Dodaj imię lub pseudonim'))}</p>
        <small>${[profile.age ? profile.age + ' ' + t('lat') : '', profile.platform || ''].filter(Boolean).map(esc).join(' · ')}</small>
        <div class="actions">${btn(t('Edytuj profil'),'edit-account','primary')}</div>
      </article>
      ${googlePanel()}
      <article class="panel settings-card">
        <h2>${t('Krótki przewodnik')}</h2>
        <div class="actions">${btn(t('Pokaż przewodnik'),'show-guide')}</div>
      </article>
      <article class="panel settings-card">
        <h2>${t('Kopia zapasowa')}</h2>
        <p class="muted">${t('Zawiera gry, postępy, własne okładki, nagrania i ustawienia. Limit pliku to 64 MB.')}</p>
        <div class="actions">${btn(t('Pobierz kopię'),'backup-export','primary')}${btn(t('Wczytaj kopię'),'backup-import')}</div>
        <input type="file" id="backup-file" accept=".json,application/json" hidden>
        <p class="muted" id="backup-status" role="status"></p>
      </article>
      <article class="panel settings-card">
        <h2>${t('Aktualizacja aplikacji')}</h2>
        <p class="muted">${t('Pobierz ponownie pliki aplikacji z serwera.')}</p>
        <div class="actions">${btn(t('Wymuś aktualizację'),'force-update')}</div>
        <p id="update-status" role="status"></p>
      </article>
      <details class="panel settings-tools"><summary>${t('Dane na urządzeniu')}</summary>
        <p class="muted">${t('Ustawienia i profil zapisują się w tej przeglądarce.')}</p>
        <div class="actions">${btn(t('Zapisz ustawienia lokalnie'),'save-local-settings')}
        ${btn(t('Wyczyść dane'),'clear-local-data','danger')}</div>
        <p class="muted" id="local-settings-status" role="status"></p>
      </details>
    </div>`;
}

function editAccount() {
  const profile = preferences.profile || {};
  openForm(t('Twój profil'),
    input(t('Imię lub pseudonim'),'name',profile.name,'maxlength="50"') +
    input(t('Wiek'),'age',profile.age,'type="number" min="1" max="120"') +
    '<label>'+t('Ulubiona platforma')+'<select name="platform"><option value="">'+t('Wybierz platformę')+'</option>' +
    options(systems, profile.platform) + '</select></label>', data => {
      preferences.profile = {
        name: data.get('name').trim(),
        age: data.get('age'),
        platform: data.get('platform'),
      };
      savePreferences();
    });
}

function appAssets(page,url) {
  return [...page.querySelectorAll('script[src],link[rel="stylesheet"]')]
    .map(asset=>new URL(asset.getAttribute(asset.tagName==='SCRIPT'?'src':'href'),url))
    .filter(source=>source.origin===url.origin);
}

let updateCheck;
let appUpdating=false;

async function fetchAppRelease() {
  const url=new URL(location.href);
  url.searchParams.set('update',Date.now());
  const response=await fetch(url,{cache:'reload',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Release unavailable');
  const page=new DOMParser().parseFromString(await response.text(),'text/html');
  const assets=appAssets(page,url);
  if(!page.querySelector('#app')||!assets.length)throw Error('Invalid release');
  return {url,assets};
}

function checkForAppUpdate() {
  if(document.readyState==='loading'||appUpdating||updateCheck)return;
  const loadedAppAssets=appAssets(document,new URL(location.href)).map(source=>source.href).join('\n');
  updateCheck=fetchAppRelease().then(({assets})=>{
    if(appUpdating)return;
    document.querySelector('#update-banner').hidden=assets.map(source=>source.href).join('\n')===loadedAppAssets;
  }).catch(()=>{}).finally(()=>{updateCheck=undefined});
}

async function forceUpdate(fromBanner=false) {
  if(appUpdating)return;
  const status=document.querySelector(fromBanner?'#banner-update-status':'#update-status');
  if(recording||deviceBusy){
    status.textContent=t(recording?'Najpierw zakończ nagrywanie.':'Poczekaj na zakończenie operacji.');
    return;
  }
  const buttons=[...document.querySelectorAll('#banner-update,[data-act="force-update"]')];
  appUpdating=true;
  buttons.forEach(button=>{button.disabled=true});
  status.textContent=t('Szukam aktualnej wersji…');
  try {
    const {url,assets}=await fetchAppRelease();
    await Promise.all(assets.map(async source=>{
      const fresh=await fetch(source,{cache:'reload',signal:AbortSignal.timeout(10000)});
      if(!fresh.ok)throw Error('Asset unavailable');
      await fresh.arrayBuffer();
    }));
    if(recording||deviceBusy){
      status.textContent=t(recording?'Najpierw zakończ nagrywanie.':'Poczekaj na zakończenie operacji.');
    }else{
      location.replace(url);
      return;
    }
  } catch {
    status.textContent=t('Aktualizacja chwilowo niedostępna. Spróbuj ponownie.');
  }
  appUpdating=false;
  buttons.forEach(button=>{button.disabled=false});
}

document.querySelector('#banner-update').onclick=()=>forceUpdate(true);
window.addEventListener('pageshow',checkForAppUpdate);
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible')checkForAppUpdate();
});

const newsSources = {
  pl: {gryonline:'GRYOnline.pl', eurogamerpl:'Eurogamer Polska', cdaction:'CD-Action', ppe:'PPE', gram:'Gram.pl', planetagracza:'PlanetaGracza', ignpl:'IGN Polska'},
  en: {eurogamer:'Eurogamer', pcgamer:'PC Gamer', rps:'Rock Paper Shotgun'},
};
let newsLimit = 6;
let newsSource = 'all';
let newsData;
let newsLoading = false;
let newsError = false;
let newsUsingFallback = false;

function changeAppLanguage(language) {
  if ((language !== 'pl' && language !== 'en') || appLanguage() === language) return;
  preferences.language = language;
  savePreferences();
  newsLimit = 6;
  newsSource = 'all';
  applyLanguage();
  render();
  app.querySelector('#app-language')?.focus();
}

function renderNews() {
  const sources = newsSources[appLanguage()];
  const sourceLabels={all:t('Wszystkie'),...sources};
  const filters = Object.entries(sourceLabels).map(([id,name]) =>
    '<button data-act="news-source-'+id+'" aria-pressed="'+(newsSource===id)+'">'+esc(name)+'</button>').join('');
  const sourceSelect='<label class="news-source-select">'+t('Źródło wiadomości')+
    '<select id="news-source">'+options(Object.keys(sourceLabels),newsSource,id=>sourceLabels[id])+'</select></label>';
  const articles = (newsData || []).filter(item=>
    Object.hasOwn(sources,item.source) && (newsSource==='all'||newsSource===item.source));
  let content = '<p role="status" class="muted">'+t('Pobieram nagłówki…')+'</p>';
  if (newsData || newsError) {
    content = articles.length ? articles.slice(0,newsLimit).map(item=>{
      const link = web(item.url);
      if (!link) return '';
      const date = item.publishedAt ? new Date(item.publishedAt).toLocaleDateString(appLocale()) : '';
      return '<a class="news-story panel" href="'+esc(link)+'" target="_blank" rel="noopener noreferrer"><span class="news-source '+esc(item.source)+'">'+esc(sources[item.source])+'</span> <small>'+esc(date)+'</small><h2>'+esc(item.title)+'</h2></a>';
    }).join('') : '<p role="status" class="muted">'+t('Brak dostępnych wiadomości dla tego źródła.')+'</p>';
  }
  const newest=Date.parse(articles[0]?.publishedAt);
  const stale=Number.isFinite(newest) && Date.now()-newest>7*86400000;
  const status=newsLoading?(newsData?t('Odświeżam wiadomości…'):''):
    newsError?t('Nie udało się odświeżyć wiadomości.'):
    newsUsingFallback?t('Wyświetlam zapisaną kopię wiadomości.'):'';
  const freshness=stale?'<p class="muted news-freshness">'+t('Najnowszy wpis w tym źródle')+' · '+
    esc(new Date(newest).toLocaleDateString(appLocale()))+'</p>':'';
  return pageHeading(t('Newsy'),'<button data-act="refresh-news" '+(newsLoading?'aria-disabled="true"':'')+'>'+t('Odśwież')+'</button>')+
    '<div class="news-filters" role="group" aria-label="'+t('Źródła')+'">'+filters+'</div>'+sourceSelect+
    '<p id="news-status" class="muted" role="status">'+status+'</p>'+freshness+
    '<div class="news-grid">'+content+'</div>'+
    (articles.length>newsLimit?btn(t('Pokaż kolejne'),'more-news'):'');
}

async function loadNews(force=false) {
  if (newsLoading || (newsData && !force)) return;
  newsLoading = true;
  app.querySelector('[data-act="refresh-news"]')?.setAttribute('aria-disabled','true');
  const status=app.querySelector('#news-status');
  if(status && newsData)status.textContent=t('Odświeżam wiadomości…');
  const urls = ['https://raw.githubusercontent.com/y33bau/checkpoint/news-data/news.json','assets/news.json?v=afterglow7'];
  try {
    const results = await Promise.allSettled(urls.map(async url=>{
      const response = await fetch(url,{cache:force?'reload':'default',signal:AbortSignal.timeout(6000)});
      if (!response.ok) throw Error('News snapshot unavailable');
      const data = await response.json();
      if (!Array.isArray(data.articles)) throw Error('Invalid news snapshot');
      return data.articles;
    }));
    const [latest, fallback] = results.map(result=>result.status==='fulfilled' ? result.value : []);
    newsUsingFallback=!latest.length && fallback.length>0;
    const available = new Set(latest.map(item=>item.source));
    const articles = [...latest,...fallback.filter(item=>!available.has(item.source))];
    if (articles.length) {
      newsData = articles.sort((a,b)=>(b.publishedAt||'').localeCompare(a.publishedAt||''));
    }
    newsError = !articles.length;
  } finally {
    newsLoading = false;
    if (location.hash==='#news'){
      const focused=document.activeElement;
      const controls=focused?.id==='news-source'?'#news-source':
        focused?.dataset.act?.startsWith('news-source-')||focused?.dataset.act==='refresh-news'
          ? '[data-act="'+focused.dataset.act+'"]':'';
      app.innerHTML = renderNews();
      if(controls)app.querySelector(controls)?.focus({preventScroll:true});
    }
  }
}

function selectNewsSource(source,control) {
  if (source !== 'all' && !Object.hasOwn(newsSources[appLanguage()],source)) return;
  newsLimit = 6;
  newsSource = source;
  app.innerHTML = renderNews();
  app.querySelector(control==='select'?'#news-source':'.news-filters [aria-pressed="true"]')?.focus({preventScroll:true});
}

function saveLocalSettings() {
  const status = document.querySelector('#local-settings-status');
  try {
    savePreferences();
    status.textContent = t('Ustawienia zapisane na tym urządzeniu.');
  } catch {
    status.textContent = t('Przeglądarka nie pozwoliła zapisać ustawień.');
  }
}

async function clearLocalData() {
  if(deviceBusy)return;
  if(recording){backupStatus('Najpierw zakończ nagrywanie.');return}
  const message=t('Usunąć lokalne dane Checkpoint wraz z nagraniami i zrzutami? Tej operacji nie można cofnąć.');
  if(!window.confirm(message))return;
  deviceBusy=true;
  try {
    pauseGoogleSync();
    await replaceDeviceData(null,null,null,[]);
    location.reload();
  } catch {backupStatus('Nie udało się wyczyścić danych.')}
  finally {deviceBusy=false}
}
