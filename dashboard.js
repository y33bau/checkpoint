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
      <details class="panel settings-tools"><summary>${t('Dane aplikacji')}</summary><div class="settings-grid">
      <article class="panel settings-card"><h2>${t('Aktualizacja aplikacji')}</h2>
        <p class="muted">${t('Pobierz ponownie pliki aplikacji z serwera.')}</p>
        <div class="actions">${btn(t('Wymuś aktualizację'),'force-update')}</div>
        <p id="update-status" role="status"></p>
      </article>
      <article class="panel settings-card"><h2>${t('Dane na urządzeniu')}</h2>
        <p class="muted">${t('Ustawienia i profil zapisują się w tej przeglądarce.')}</p>
        <div class="actions">${btn(t('Zapisz ustawienia lokalnie'),'save-local-settings')}
        ${btn(t('Wyczyść dane'),'clear-local-data','danger')}</div>
        <p class="muted" id="local-settings-status" role="status"></p>
        <div class="actions">${btn(t('Pobierz kopię'),'backup-export')}${btn(t('Wczytaj kopię'),'backup-import')}</div>
        <input type="file" id="backup-file" accept=".json,application/json" hidden>
        <p class="muted" id="backup-status" role="status"></p>
      </article>
    </div></details></div>`;
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

async function forceUpdate() {
  const status = document.querySelector('#update-status');
  const button = document.querySelector('[data-act="force-update"]');
  button.disabled = true;
  status.textContent = t('Szukam aktualnej wersji…');
  try {
    const url = new URL(location.href);
    url.searchParams.set('update',Date.now());
    const response = await fetch(url,{cache:'reload',signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw Error();
    const next = new DOMParser().parseFromString(await response.text(),'text/html');
    const assets = [...next.querySelectorAll('script[src],link[rel="stylesheet"]')];
    await Promise.all(assets.map(async asset => {
      const source = new URL(asset.getAttribute(asset.tagName==='SCRIPT'?'src':'href'),url);
      if (source.origin !== url.origin) return;
      const fresh = await fetch(source,{cache:'reload',signal:AbortSignal.timeout(10000)});
      if (!fresh.ok) throw Error();
      await fresh.arrayBuffer();
    }));
    location.replace(url);
  } catch {
    button.disabled = false;
    status.textContent = t('Aktualizacja chwilowo niedostępna. Spróbuj ponownie.');
  }
}

const newsSources = {
  pl: {gryonline:'GRYOnline.pl', eurogamerpl:'Eurogamer Polska', cdaction:'CD-Action', ppe:'PPE', gram:'Gram.pl', planetagracza:'PlanetaGracza', ignpl:'IGN Polska'},
  en: {eurogamer:'Eurogamer', pcgamer:'PC Gamer', rps:'Rock Paper Shotgun'},
};
let newsLimit = 6;
let newsSource = 'all';
let newsData;
let newsLoading = false;
let newsError = false;

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
  const filters = Object.entries({all:t('Wszystkie'), ...sources}).map(([id,name]) =>
    '<button data-act="news-source-'+id+'" aria-pressed="'+(newsSource===id)+'">'+name+'</button>').join('');
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
  return pageHeading(t('Newsy'),btn(t('Odśwież'),'refresh-news')) + '<div class="news-filters" aria-label="'+t('Źródła')+'">'+filters+
    '</div>'+(newsError?'<p class="muted" role="status">'+t('Nie udało się odświeżyć wiadomości.')+'</p>':'')+
    '<div class="news-grid">'+content+'</div>'+
    (articles.length>newsLimit?btn(t('Pokaż kolejne'),'more-news'):'');
}

async function loadNews(force=false) {
  if (newsLoading || (newsData && !force)) return;
  newsLoading = true;
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
    const available = new Set(latest.map(item=>item.source));
    const articles = [...latest,...fallback.filter(item=>!available.has(item.source))];
    if (articles.length) {
      newsData = articles.sort((a,b)=>(b.publishedAt||'').localeCompare(a.publishedAt||''));
    }
    newsError = !articles.length;
  } finally {
    newsLoading = false;
    if (location.hash==='#news') app.innerHTML = renderNews();
  }
}

function selectNewsSource(source) {
  if (source !== 'all' && !Object.hasOwn(newsSources[appLanguage()],source)) return;
  newsLimit = 6;
  newsSource = source;
  app.innerHTML = renderNews();
  app.querySelector('[aria-pressed="true"]')?.focus();
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
    await replaceDeviceData(null,null,null,[]);
    location.reload();
  } catch {backupStatus('Nie udało się wyczyścić danych.')}
  finally {deviceBusy=false}
}
