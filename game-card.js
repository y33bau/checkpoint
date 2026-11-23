function playthroughPanel(game) {
  const run=game.runs[game.system];
  const notice=gamePassNotice(game,true);
  const minutes=run.sessions.reduce((sum,session)=>sum+session.minutes,0);
  const locale=new Intl.NumberFormat(appLocale());
  return '<section class="panel feature-panel"><div class="row"><h2>'+t('Przejście')+'</h2>'+
    '<select aria-label="'+t('Platforma przejścia')+'" id="system">'+options(Object.keys(game.runs),game.system)+'</select></div>'+
    '<div class="game-progress"><strong>'+locale.format(run.progress)+'%</strong>'+bar(run.progress)+'</div>'+
    '<p class="muted">'+locale.format(minutes)+' '+t('min zapisanych')+
    (Number.isFinite(run.importedMinutes)?' · '+locale.format(run.importedMinutes)+' '+t('min z platformy')+' '+esc(game.system):'')+'</p>'+
    (notice?'<div class="gamepass-banner">'+notice+'</div>':'')+activityPanel(run)+achievementsPanel(game,run)+xboxAchievementsButton(game)+'</section>';
}

function sessionLog(run) {
  const entries=run.sessions.slice().reverse().map(session=>{
    const date=session.playedAt?new Date(session.playedAt).toLocaleDateString(appLocale()):session.date;
    return '<li><strong>'+esc(date)+' · '+session.minutes+' min</strong>'+
      (session.note?'<p>'+esc(session.note)+'</p>':'')+'</li>';
  }).join('');
  return '<section class="panel feature-panel"><h2>'+t('Dziennik sesji')+'</h2>'+
    (entries?'<ul class="session-log">'+entries+'</ul>':'<p class="muted">'+t('Tutaj pojawi się pierwsza zapisana sesja.')+'</p>')+'</section>';
}

function mapsAndGoals(game) {
  const maps=game.maps.map(map=>resourceLink(map.name,map.url,'entry')).join('');
  const guides=(game.guides||[]).map(item=>'<div class="entry saved-guide">'+
    resourceLink(item.name,item.url,'text-link')+
    (item.goal?'<small>'+esc(item.goal)+'</small>':'')+'</div>').join('');
  const goals=game.tasks.map((task,index)=>goalRow(task,index)).join('');
  return '<div class="game-section-grid"><section class="panel feature-panel"><div class="row"><h2>'+t('Cele')+'</h2>'+
    btn(t('＋ Dodaj cel'),'task','primary')+'</div>'+
    (goals||'<p class="muted">'+t('Dodaj pierwszy cel dla tej gry.')+'</p>')+'</section>'+
    '<section class="panel feature-panel">'+matchMapsCard(game)+'<h2>'+t('Mapy i poradniki')+'</h2><div class="actions">'+
    btn(t('Mapy z Wand'),'wand-maps')+btn(t('Utknąłem'),'stuck')+btn(t('Wklej linki'),'resource-paste')+'</div><div id="wand-quick-import" class="actions"></div>'+
    '<h3>'+t('Mapy')+'</h3>'+(maps||'<p class="muted">'+t('Przypnij link do mapy gry.')+'</p>')+
    '<h3>'+t('Poradniki')+'</h3>'+(guides||'<p class="muted">'+t('Nie ma zapisanych poradników.')+'</p>')+'</section></div>';
}

function gameRatings(game) {
  const mean=score(game);
  const total=mean===null?'—':mean.toLocaleString(appLocale(),{minimumFractionDigits:1,maximumFractionDigits:1});
  return '<div class="game-section-grid"><div><section class="panel feature-panel"><div class="row"><h2>'+t('Twoja ocena')+'</h2>'+
    btn(t('Oceń grę'),'rate','primary')+'</div>'+
    '<p class="game-score"><span class="number">'+total+'</span> / 10</p></section>'+criticScoresPanel(game)+'<div class="igdb-score-slot">'+igdbTarget(game,'scores')+'</div>'+startRatingPanel(game)+'</div>'+
    '<div>'+chroniclePanel(game)+'</div></div>';
}

const gameTabs={overview:'Przegląd',goals:'Cele i poradniki',ratings:'Oceny i kronika'};
let currentGameTab='overview';
let displayedGameId;
function renderGameCard(game) {
  if(displayedGameId!==game.id){
    displayedGameId=game.id;
    currentGameTab='overview';
  }
  const tabs=Object.entries(gameTabs).map(([id,label])=>
    '<button type="button" data-act="game-tab:'+id+'" aria-pressed="'+(currentGameTab===id)+'">'+t(label)+'</button>').join('');
  const run=game.runs[game.system];
  const views={
    overview:()=>'<div class="game-section-grid"><div>'+returnPanel(game,run)+sessionLog(run)+'</div><div>'+playthroughPanel(game)+voicePanel()+'</div></div>',
    goals:()=>mapsAndGoals(game),
    ratings:()=>gameRatings(game),
  };
  const upload=btn(t('Wgraj okładkę'),'upload-cover');
  const hasCover=Boolean(gameCoverSource(game)||web(game.coverFallback||''));
  const archiveLabel=game.archived?'Przywróć do biblioteki':'Archiwizuj grę';
  return pageHeading(t('Karta gry'),btn(t('Edytuj'),'edit'))+
    banner(game,'<p>'+esc(game.catalog)+(gameGenre(game)?' · '+esc(t(gameGenre(game))):'')+'</p><div class="actions">'+(game.archived?btn(t(archiveLabel),'archive-game','primary'):btn(t('Zapisz sesję'),'session','primary'))+(!hasCover?upload:'')+primaryGuideLink(game)+
      '</div><details class="extra-options"><summary>'+t('Opcje gry')+'</summary><div class="actions">'+youtubeGuide(game)+(game.archived?'':playingToggle(game)+queueToggle(game))+
      (hasCover?upload:'')+btn(t('Odśwież okładkę'),'refresh-cover')+(!game.archived?btn(t(archiveLabel),'archive-game'):'')+'</div></details>')+
    '<div class="game-tabs" role="group" aria-label="'+t('Sekcje karty gry')+'">'+tabs+'</div>'+
    views[currentGameTab]();
}
