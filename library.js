const libraryPageSize = 30;
const libraryCollator = new Intl.Collator(['pl','en'],{numeric:true,sensitivity:'base'});
const librarySorts = {
  recent:'Ostatnio grane',
  added:'Ostatnio dodane',
  title:'A–Z',
  rating:'Najwyżej oceniane',
  hours:'Najwięcej godzin',
};
let libraryStatus = '';
let libraryLimit = libraryPageSize;

function librarySettings() {
  const saved = preferences.library || {};
  return {
    view:saved.view==='covers'?'covers':'list',
    sort:Object.hasOwn(librarySorts,saved.sort)?saved.sort:'recent',
  };
}

function updateLibrarySetting(key, value) {
  preferences.library = {...librarySettings(),[key]:value};
  savePreferences();
}

function historicalSessionTime(session) {
  if (Number.isFinite(session.playedAt)) return session.playedAt;
  // Older versions kept a date formatted as dd.mm.yyyy or dd/mm/yyyy.
  const match = /^(\d{1,2})[./](\d{1,2})[./](\d{4})\.?$/.exec(session.date || '');
  if (!match) return 0;
  const [,day,month,year] = match.map(Number);
  return Date.UTC(year,month-1,day);
}

function libraryMetrics(game) {
  let lastPlayed = 0;
  let minutes = 0;
  for (const run of Object.values(game.runs)) {
    let logged = 0;
    for (const session of run.sessions) {
      logged += session.minutes || 0;
      lastPlayed = Math.max(lastPlayed,historicalSessionTime(session));
    }
    minutes += Math.max(logged,run.importedMinutes || 0);
    lastPlayed = Math.max(lastPlayed,run.importedPlayedAt || 0);
  }
  return {lastPlayed,minutes};
}

function visibleLibraryGames() {
  const {sort} = librarySettings();
  const query = catalogText(filter);
  const prepared = games.flatMap((game,index)=>{
    if ((query && !catalogText(game.title).includes(query)) ||
        (libraryStatus && (libraryStatus==='queue' ? !game.pinnedAt : game.status!==libraryStatus)) ||
        (collection && collection!==game.catalog) ||
        (platform && !game.runs[platform])) return [];
    return [{game,index,...(sort==='recent'||sort==='hours'?libraryMetrics(game):{})}];
  });
  const order = {
    recent:(a,b)=>b.lastPlayed-a.lastPlayed || Number(b.game.status==='Gram')-Number(a.game.status==='Gram'),
    added:(a,b)=>(b.game.addedAt||0)-(a.game.addedAt||0) || b.index-a.index,
    title:(a,b)=>libraryCollator.compare(a.game.title,b.game.title),
    rating:(a,b)=>(score(b.game)??-1)-(score(a.game)??-1),
    hours:(a,b)=>b.minutes-a.minutes,
  };
  return prepared.sort((a,b)=>order[sort](a,b)||libraryCollator.compare(a.game.title,b.game.title)).map(row=>row.game);
}

function libraryPressed(label, action, isPressed) {
  return '<button type="button" data-act="'+esc(action)+'" aria-pressed="'+isPressed+'">'+t(label)+'</button>';
}

function renderLibrary() {
  const {view,sort} = librarySettings();
  const filters = [['','Wszystkie'],['Gram','W trakcie'],['W kolejce','Do ogrania'],['Ukończona','Ukończone'],['queue','Moja kolejka']];
  const sortOptions = Object.entries(librarySorts).map(([id,label])=>
    '<option value="'+id+'" '+(sort===id?'selected':'')+'>'+t(label)+'</option>').join('');
  return pageHeading(t('Biblioteka'),btn(t('＋ Dodaj grę'),'add','primary')) +
    '<div class="library-controls">'+
      '<input id="search" type="search" aria-label="'+t('Szukaj gry')+'" placeholder="'+t('Szukaj gry…')+'" value="'+esc(filter)+'">'+
      '<div class="library-chips" aria-label="'+t('Status')+'">'+filters.map(([id,label])=>libraryPressed(label,'library-filter:'+id,libraryStatus===id)).join('')+'</div>'+
      '<div class="filters">'+
        '<select id="catalog" aria-label="'+t('Katalog')+'"><option value="">'+t('Wszystkie katalogi')+'</option>'+options([...new Set(games.map(game=>game.catalog))],collection)+'</select>'+
        '<select id="platform" aria-label="'+t('Filtr platformy')+'"><option value="">'+t('Wszystkie platformy')+'</option>'+options(systems,platform)+'</select>'+
        '<select id="library-sort" aria-label="'+t('Sortowanie')+'">'+sortOptions+'</select>'+
        '<div class="library-view" aria-label="'+t('Widok biblioteki')+'">'+libraryPressed('Lista','library-view:list',view==='list')+libraryPressed('Okładki','library-view:covers',view==='covers')+'</div>'+
        btn(t('Import Steam JSON'),'import')+
      '</div>'+
    '</div><div id="results"></div>';
}

function queueToggle(game, compact=false) {
  const label = t(game.pinnedAt?'Usuń z kolejki':'Przypnij do kolejki');
  return '<button type="button" class="queue-toggle'+(compact?' queue-icon':'')+'" data-queue="'+esc(game.id)+'" aria-pressed="'+Boolean(game.pinnedAt)+'" aria-label="'+esc(label+' · '+game.title)+'"'+(compact?' title="'+esc(label)+'"':'')+'>'+
    (compact?(game.pinnedAt?'★':'☆'):label)+'</button>';
}

function libraryRow(game, covers) {
  const title = esc(game.title);
  const cover = '<span class="cover"><b>'+title+'</b>'+coverImage(game)+'</span>';
  const metadata = '<span class="info"><strong>'+title+'</strong><small>'+esc(Object.keys(game.runs).join(' · '))+' · '+t(game.status)+'</small></span>';
  return '<div class="library-item"><button type="button" class="'+(covers?'tile':'library-row')+'" data-game="'+esc(game.id)+'">'+cover+metadata+'</button>'+queueToggle(game,true)+'</div>';
}

function renderLibraryResults() {
  const results = visibleLibraryGames();
  const covers = librarySettings().view==='covers';
  const shown = results.slice(0,libraryLimit);
  const number = new Intl.NumberFormat(appLocale());
  const summary = number.format(shown.length)+' / '+number.format(results.length)+' '+t('wyników');
  document.querySelector('#results').innerHTML =
    '<p class="library-count muted" role="status">'+summary+'</p>'+
    (shown.length?'<div class="'+(covers?'grid library-covers':'library-list')+'">'+shown.map(game=>libraryRow(game,covers)).join('')+'</div>':
      '<p class="panel">'+t('Brak gier dla tego wyboru.')+'</p>')+
    (results.length>shown.length?'<div class="library-more">'+btn(t('Pokaż kolejne'),'library-more')+'</div>':'');
}

function toggleQueue(id) {
  const game = games.find(item=>item.id===id);
  if (!game) return;
  if (game.pinnedAt) delete game.pinnedAt;
  else game.pinnedAt = Date.now();
  persist();
  if (location.hash==='#library') renderLibraryResults();
  else render();
  const button = [...app.querySelectorAll('[data-queue]')].find(item=>item.dataset.queue===id);
  (button || app.querySelector('.library-chips [aria-pressed="true"]'))?.focus({preventScroll:true});
}

function queuedGames(current) {
  return games.filter(game=>game.pinnedAt && game!==current).sort((a,b)=>a.pinnedAt-b.pinnedAt);
}
