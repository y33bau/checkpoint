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
let librarySource = '';
let libraryGenre = '';
let libraryMode = '';

function clearLibraryFilters() {
  filter=collection=platform=libraryStatus=librarySource=libraryGenre='';
  libraryLimit=libraryPageSize;
}

function libraryFiltersActive() {
  return Boolean(filter||collection||platform||libraryStatus||librarySource||libraryGenre);
}
let libraryLimit = libraryPageSize;

function librarySettings() {
  const saved = preferences.library || {};
  return {
    view:['list','groups'].includes(saved.view)?saved.view:'covers',
    sort:Object.hasOwn(librarySorts,saved.sort)?saved.sort:(saved.view==='list'?'title':'recent'),
  };
}

function updateLibrarySetting(key, value) {
  preferences.library = {...preferences.library,[key]:value};
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
  const sort = libraryMode==='rated'?'rating':librarySettings().sort;
  const query = catalogText(filter);
  const prepared = games.flatMap((game,index)=>{
    if (Boolean(game.archived)!==(libraryMode==='archive') ||
        (libraryMode==='rated' && score(game)===null) ||
        (query && !catalogText(game.title).includes(query)) ||
        (libraryStatus && (libraryStatus==='queue' ? !game.pinnedAt : game.status!==libraryStatus)) ||
        (librarySource && !(game.importSources?.[librarySource] || (librarySource==='steam' && game.steamAppId))) ||
        (libraryGenre && (gameGenre(game)||'unknown')!==libraryGenre) ||
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
  const refresh=games.some(game=>!game.archived)?btn(t('Odśwież okładki'),'refresh-all-covers'):'';
  const groupView=view==='groups' && libraryMode!=='rated';
  return pageHeading(t('Biblioteka'),'<div class="actions">'+refresh+btn(t('＋ Dodaj grę'),'pick:playing','primary')+'</div>') +
    '<div class="library-controls">'+
      '<input id="search" type="search" aria-label="'+t('Szukaj gry')+'" placeholder="'+t('Szukaj gry…')+'" value="'+esc(filter)+'">'+
      '<div class="library-view" role="group" aria-label="'+t('Widok biblioteki')+'">'+
      libraryPressed('Półka','library-view:covers',(view==='covers'||(view==='groups'&&libraryMode==='rated')))+libraryPressed('Indeks','library-view:list',view==='list')+
      libraryPressed('Według statusu','library-view:groups',groupView)+'</div>'+
      '<details class="library-options" '+(collection||platform||libraryStatus||librarySource||libraryGenre?'open':'')+'><summary>'+t('Filtry i sortowanie')+'</summary>'+
      '<div class="library-chips" aria-label="'+t('Status')+'">'+filters.map(([id,label])=>libraryPressed(label,'library-filter:'+id,libraryStatus===id)).join('')+'</div>'+
      '<div class="filters">'+
        '<select id="catalog" aria-label="'+t('Katalog')+'"><option value="">'+t('Wszystkie katalogi')+'</option>'+options([...new Set(games.map(game=>game.catalog))],collection)+'</select>'+
        '<select id="platform" aria-label="'+t('Filtr platformy')+'"><option value="">'+t('Wszystkie platformy')+'</option>'+options(systems,platform)+'</select>'+
        '<select id="library-source" aria-label="'+t('Źródło importu')+'"><option value="">'+t('Wszystkie źródła')+
        '</option>'+Object.entries({steam:{name:'Steam'},...librarySources}).map(([id,provider])=>'<option value="'+id+'" '+(librarySource===id?'selected':'')+'>'+provider.name+'</option>').join('')+'</select>'+
        '<select id="library-genre" aria-label="'+t('Gatunek')+'">'+genreFilterOptions()+'</select>'+
        (libraryMode==='rated'?'<span class="muted">'+t('Najwyżej oceniane')+'</span>':
        '<select id="library-sort" aria-label="'+t('Sortowanie')+'">'+sortOptions+'</select>')+
        btn(t('Import Steam JSON'),'import')+
      '</div>'+
    '</details></div><div id="results"></div>';
}

function genreFilterOptions() {
  const genres=[...new Set(games.map(gameGenre).filter(Boolean))].sort((a,b)=>libraryCollator.compare(t(a),t(b)));
  if(libraryGenre && libraryGenre!=='unknown' && !genres.includes(libraryGenre))genres.push(libraryGenre);
  return '<option value="">'+t('Wszystkie gatunki')+'</option>'+
    options([...genres,'unknown'],libraryGenre,genre=>t(genre==='unknown'?'Bez gatunku':genre));
}

function refreshGenreFilter() {
  const select=app.querySelector('#library-genre');
  if(!select)return;
  select.innerHTML=genreFilterOptions();
  renderLibraryResults();
}

function queueToggle(game, compact=false) {
  const label = t(game.pinnedAt?'Usuń z kolejki':'Przypnij do kolejki');
  return '<button type="button" class="queue-toggle'+(compact?' queue-icon':'')+'" data-queue="'+esc(game.id)+'" aria-pressed="'+Boolean(game.pinnedAt)+'" aria-label="'+esc(label+' · '+game.title)+'"'+(compact?' title="'+esc(label)+'"':'')+'>'+
    (compact?(game.pinnedAt?'★':'☆'):label)+'</button>';
}

function playingToggle(game, compact=false) {
  const playing = game.status==='Gram';
  const label = t(playing?'Usuń z ogrywanych':'Dodaj do ogrywanych');
  return '<button type="button" class="playing-toggle'+(compact?' library-icon':'')+'" data-playing="'+esc(game.id)+'" aria-pressed="'+playing+'" aria-label="'+esc(label+' · '+game.title)+'"'+(compact?' title="'+esc(label)+'"':'')+'>'+
    (compact?'<span class="play-glyph" aria-hidden="true"></span>':label)+'</button>';
}

function gameTile(game,{actions=true,details='',badge='',description='',eagerCover=false}={}) {
  const title=esc(game.title);
  const initials=game.title.trim().split(/\s+/).slice(0,2).map(word=>Array.from(word)[0]).join('');
  const genre=gameGenre(game);
  const metadata=[...Object.keys(game.runs),genre?t(genre):'',t(game.status),game.demo?t('Gra przykładowa'):''].filter(Boolean).map(esc).join(' · ');
  const tag=game.demo?t('Demo'):game.system;
  return '<div class="library-item"><div class="library-tile-face">'+
    '<div class="tile-poster"><button type="button" class="tile" data-game="'+esc(game.id)+'" aria-label="'+title+(description?' · '+esc(description):'')+'">'+
    '<span class="cover" aria-hidden="true"><b>'+esc(initials)+'</b>'+coverImage(game,eagerCover)+'</span>'+
    '<strong class="tile-caption" aria-hidden="true">'+title+'</strong></button>'+badge+
    (!badge?'<span class="tile-platform">'+esc(tag)+'</span>':'')+
    '<button type="button" class="tile-disclosure" aria-label="'+esc(t('Pokaż szczegóły')+' · '+game.title)+'" aria-expanded="false" data-act="tile-details">＋</button></div>'+
    '<div class="tile-expansion"><div class="tile-detail"><strong>'+title+'</strong><small>'+metadata+'</small>'+
    details+gamePassNotice(game)+(actions&&!game.archived?'<div class="library-actions">'+playingToggle(game,true)+queueToggle(game,true)+'</div>':'')+
    '</div></div></div></div>';
}

function libraryRow(game, rating) {
  const title=esc(game.title);
  const cover='<span class="cover" aria-hidden="true">'+coverImage(game)+'</span>';
  const metadata='<span class="info"><strong>'+title+'</strong><small>'+esc(Object.keys(game.runs).join(' · '))+' · '+t(game.status)+
    (game.demo?' · '+t('Demo'):'')+'</small>'+gamePassNotice(game)+'</span>';
  return '<div class="library-item"><button type="button" class="library-row" data-game="'+esc(game.id)+'">'+cover+metadata+
    (rating?'<span class="library-row-score">'+esc(rating)+'</span>':'')+'</button>'+
    (game.archived?'':'<span class="library-actions">'+playingToggle(game,true)+queueToggle(game,true)+'</span>')+'</div>';
}

function toggleTileDetails(button) {
  const tile=button.closest('.library-item');
  const opening=!tile.classList.contains('tile-expanded');
  for(const expanded of app.querySelectorAll('.tile-expanded')){
    expanded.classList.remove('tile-expanded');
    const disclosure=expanded.querySelector('.tile-disclosure');
    disclosure.setAttribute('aria-expanded','false');
    disclosure.textContent='＋';
  }
  if(opening){
    tile.classList.add('tile-expanded');
    button.setAttribute('aria-expanded','true');
    button.textContent='−';
  }
}

function ratedLibraryTile(game, covers, eagerCover=false) {
  const formatted=score(game).toLocaleString(appLocale(),{minimumFractionDigits:1,maximumFractionDigits:1})+' / 10';
  const categories=game.scores.filter(Number.isFinite).length+' / '+criteria.length+' '+t('ocenionych kategorii');
  return covers
    ? gameTile(game,{eagerCover,badge:'<span class="tile-rank">'+esc(formatted)+'</span>',details:'<small>'+esc(categories)+'</small>',description:formatted+' · '+categories})
    : libraryRow(game,formatted+' · '+categories);
}

function renderLibraryResults() {
  const results = visibleLibraryGames();
  const view = librarySettings().view;
  const rated = libraryMode==='rated';
  const covers = view==='covers'||(rated&&view==='groups');
  const shown = results.slice(0,libraryLimit);
  const number = new Intl.NumberFormat(appLocale());
  const summary = number.format(shown.length)+' / '+number.format(results.length)+' '+t('wyników');
  const groups=view==='groups'&&!rated;
  const container=document.querySelector('#results');
  const expanded=new Map([...container.querySelectorAll('details[data-section]')].map(el=>[el.dataset.section,el.open]));
  const sections=groups?statuses.map(status=>{
    const list=results.filter(game=>game.status===status);
    if(!list.length)return '';
    const open=expanded.get(status)??(Boolean(filter)||status===(results.some(g=>g.status===statuses[0])?statuses[0]:results[0]?.status));
    return '<details class="collection-section" data-section="'+esc(status)+'" '+(open?'open':'')+'><summary>'+t(status)+' <small>'+number.format(list.length)+'</small></summary><div class="grid library-covers">'+
      list.slice(0,libraryLimit).map((game,index)=>gameTile(game,{eagerCover:open&&index<4})).join('')+'</div></details>';
  }).join(''):'';
  const visibleCount=groups?statuses.reduce((sum,status)=>sum+Math.min(libraryLimit,results.filter(g=>g.status===status).length),0):shown.length;
  const canReset=libraryFiltersActive();
  const archive=games.some(game=>game.archived)||libraryMode==='archive'
    ? libraryPressed('Archiwum','library-mode:archive',libraryMode==='archive'):'';
  const emptyMessage=canReset?'Brak gier dla tego wyboru.':rated?'Oceń grę, aby pojawiła się w tym widoku.':libraryMode==='archive'?'Archiwum jest puste.':'Brak gier dla tego wyboru.';
  container.innerHTML =
    '<div class="library-result-header"><p class="library-count muted" role="status">'+
    (groups?number.format(visibleCount)+' / '+number.format(results.length)+' '+t('wyników'):summary)+'</p>'+
    '<div class="library-modes library-chips" role="group" aria-label="'+t('Szybkie filtry')+'">'+
    libraryPressed('Moje oceny','library-mode:rated',rated)+archive+
    (canReset?btn(t('Wyczyść filtry'),'library-reset'):'')+'</div></div>'+
    (sections|| (shown.length?'<div class="'+(covers?'grid library-covers':'library-list')+'">'+shown.map((game,index)=>rated?ratedLibraryTile(game,covers,index<4):covers?gameTile(game,{eagerCover:index<4}):libraryRow(game)).join('')+'</div>':
      '<p class="panel">'+t(emptyMessage)+'</p>'))+
    (results.length>visibleCount?'<div class="library-more">'+btn(t('Pokaż kolejne'),'library-more')+'</div>':'');
  observeIgdbMetadata(app);
}

function toggleQueue(id) {
  const game = games.find(item=>item.id===id);
  if (!game||game.archived) return;
  if (game.pinnedAt) delete game.pinnedAt;
  else game.pinnedAt = Date.now();
  persist();
  if (location.hash==='#library') renderLibraryResults();
  else render();
  const button = [...app.querySelectorAll('[data-queue]')].find(item=>item.dataset.queue===id);
  (button || app.querySelector('.library-chips [aria-pressed="true"]'))?.focus({preventScroll:true});
}

function togglePlaying(id) {
  const game = games.find(item=>item.id===id);
  if (!game||game.archived) return;
  if (game.status==='Gram') {
    game.status = 'W kolejce';
    if (preferences.featuredGameId===id) {
      delete preferences.featuredGameId;
      savePreferences();
    }
  } else {
    game.status = 'Gram';
    preferences.featuredGameId = id;
    savePreferences();
  }
  persist();
  if (location.hash==='#library') renderLibraryResults();
  else render();
  const button = [...app.querySelectorAll('[data-playing]')].find(item=>item.dataset.playing===id);
  (button || app.querySelector('.library-chips [aria-pressed="true"]'))?.focus({preventScroll:true});
}

function queuedGames(current) {
  return games.filter(game=>!game.archived && game.pinnedAt && game!==current).sort((a,b)=>a.pinnedAt-b.pinnedAt);
}
