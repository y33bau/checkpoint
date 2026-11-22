const settingsKey = 'checkpoint-settings-v1';
const defaultWeather = { name: 'Łańcut', latitude: 50.0687, longitude: 22.2291 };
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
  const place = preferences.weather || defaultWeather;
  return pageHeading('Ustawienia') + `
    <div class="settings-grid">
      <article class="panel settings-card"><h2>Twój profil</h2>
        <p>${esc(profile.name || 'Dodaj imię lub pseudonim')}</p>
        <small>${[profile.age ? profile.age + ' lat' : '', profile.platform || ''].filter(Boolean).map(esc).join(' · ')}</small>
        <div class="actions">${btn('Edytuj profil','edit-account','primary')}</div>
      </article>
      <article class="panel settings-card"><h2>Pogoda</h2><p>${esc(place.name)}</p>
        <div class="actions">${btn('Zmień miejscowość','edit-weather')}</div>
      </article>
      <article class="panel settings-card"><h2>Aktualizacja aplikacji</h2>
        <p class="muted">Pobierz ponownie pliki aplikacji z serwera.</p>
        <div class="actions">${btn('Wymuś aktualizację','force-update')}</div>
        <p id="update-status" role="status"></p>
      </article>
    </div>`;
}

function editAccount() {
  const profile = preferences.profile || {};
  openForm('Twój profil',
    input('Imię lub pseudonim','name',profile.name,'maxlength="50"') +
    input('Wiek','age',profile.age,'type="number" min="1" max="120"') +
    '<label>Ulubiona platforma<select name="platform"><option value="">Wybierz platformę</option>' +
    options(systems, profile.platform) + '</select></label>', data => {
      preferences.profile = {
        name: data.get('name').trim(),
        age: data.get('age'),
        platform: data.get('platform'),
      };
      savePreferences();
    });
}

function editWeather() {
  openForm('Miejscowość', input('Nazwa miejscowości','city','','required maxlength="80"') +
    '<p id="city-results" role="status"></p>', () => {});
  form.onsubmit = async event => {
    event.preventDefault();
    const results = document.querySelector('#city-results');
    const save = document.querySelector('#save');
    const city = new FormData(form).get('city').trim();
    if (city.length < 2) {
      results.textContent = 'Wpisz co najmniej dwie litery.';
      return;
    }
    save.disabled = true;
    results.textContent = 'Szukam miejscowości…';
    try {
      const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
      url.search = new URLSearchParams({name:city, count:'7', language:'pl'});
      const response = await fetch(url, {signal:AbortSignal.timeout(8000)});
      if (!response.ok) throw Error();
      const {results:places = []} = await response.json();
      results.replaceChildren();
      if (!places.length) results.textContent = 'Brak wyników. Spróbuj innej nazwy.';
      for (const place of places) {
        const choice = document.createElement('button');
        choice.type = 'button';
        choice.className = 'city-choice';
        choice.textContent = [place.name, place.admin1, place.country].filter(Boolean).join(' · ');
        choice.onclick = () => {
          preferences.weather = {name:place.name, latitude:place.latitude, longitude:place.longitude};
          savePreferences();
          dialog.close();
          render();
          loadWeather();
        };
        results.append(choice);
      }
    } catch {
      results.textContent = 'Nie udało się wyszukać miejscowości.';
    } finally {
      save.disabled = false;
    }
  };
}

let weatherRequest;
async function loadWeather() {
  weatherRequest?.abort();
  weatherRequest = new AbortController();
  const signal = weatherRequest.signal;
  const place = preferences.weather || defaultWeather;
  const panel = document.querySelector('#weather');
  const city = '<a href="#settings" class="weather-location" aria-label="Ustawienia pogody"><span aria-hidden="true">◉</span> '+esc(place.name)+'</a>';
  panel.innerHTML = city + '<span class="weather-status">Pobieram pogodę…</span>';
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({
      latitude: place.latitude,
      longitude: place.longitude,
      current:'temperature_2m,wind_speed_10m,precipitation,pressure_msl',
    });
    const response = await fetch(url, {signal:AbortSignal.any([signal,AbortSignal.timeout(9000)])});
    if (!response.ok) throw Error();
    const {current} = await response.json();
    if (signal.aborted) return;
    const number = (value, digits=0) => new Intl.NumberFormat('pl-PL',{maximumFractionDigits:digits}).format(value);
    const metrics = [
      ['Temp.', current.temperature_2m, '°C', 0],
      ['Wiatr', current.wind_speed_10m, 'km/h', 0],
      ['Opady', current.precipitation, 'mm', 1],
      ['Ciśnienie', current.pressure_msl, 'hPa', 0],
    ];
    panel.innerHTML = city + metrics.map(([label,value,unit,digits]) =>
      '<span class="weather-metric"><small>'+label+'</small><strong>'+
      (Number.isFinite(value)?number(value,digits)+' '+unit:'—')+'</strong></span>').join('');
  } catch {
    if (!signal.aborted) panel.innerHTML = city + '<span class="weather-status">Pogoda chwilowo niedostępna</span>';
  }
}

async function forceUpdate() {
  const status = document.querySelector('#update-status');
  const button = document.querySelector('[data-act="force-update"]');
  button.disabled = true;
  status.textContent = 'Szukam aktualnej wersji…';
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
    status.textContent = 'Aktualizacja chwilowo niedostępna. Spróbuj ponownie.';
  }
}

const newsSources = {all:'Wszystkie', eurogamer:'Eurogamer', pcgamer:'PC Gamer', rps:'Rock Paper Shotgun'};
let newsSource = 'all';
let newsData;
let newsLoading = false;
let newsError = false;

function renderNews() {
  const filters = Object.entries(newsSources).map(([id,name]) =>
    '<button data-act="news-source-'+id+'" aria-pressed="'+(newsSource===id)+'">'+name+'</button>').join('');
  const articles = (newsData?.articles || []).filter(item=>newsSource==='all'||newsSource===item.source);
  let content = '<p role="status" class="muted">Pobieram nagłówki…</p>';
  if (newsData || newsError) {
    content = articles.length ? articles.slice(0,24).map(item=>{
      const link = web(item.url);
      if (!link) return '';
      const date = item.publishedAt ? new Date(item.publishedAt).toLocaleDateString('pl-PL') : '';
      return '<a class="news-story panel" href="'+esc(link)+'" target="_blank" rel="noopener noreferrer"><span class="news-source '+esc(item.source)+'">'+esc(newsSources[item.source])+'</span><h2>'+esc(item.title)+'</h2><small>'+esc(date)+'</small></a>';
    }).join('') : '<p role="status" class="muted">Brak dostępnych wiadomości dla tego źródła.</p>';
  }
  return pageHeading('Newsy',btn('Odśwież','refresh-news')) + '<div class="news-filters" aria-label="Źródła">'+filters+
    '</div>'+(newsError?'<p class="muted" role="status">Nie udało się odświeżyć wiadomości.</p>':'')+
    '<div class="news-grid">'+content+'</div>';
}

async function loadNews(force=false) {
  if (newsLoading || ((newsData || newsError) && !force)) return;
  newsLoading = true;
  try {
    const origins = ['https://raw.githubusercontent.com/y33bau/checkpoint/news-data/news.json','assets/news.json'];
    for (const url of origins) {
      try {
        const response = await fetch(url,{cache:force?'reload':'default',signal:AbortSignal.timeout(6000)});
        if (!response.ok) continue;
        const data = await response.json();
        if (!Array.isArray(data.articles) || !data.articles.length) continue;
        newsData = data;
        newsError = false;
        break;
      } catch {
        continue;
      }
    }
    if (!newsData) newsError = true;
  } finally {
    newsLoading = false;
    if (location.hash==='#news') app.innerHTML = renderNews();
  }
}

function selectNewsSource(source) {
  if (!Object.hasOwn(newsSources,source)) return;
  newsSource = source;
  app.innerHTML = renderNews();
  app.querySelector('[aria-pressed="true"]')?.focus();
}
