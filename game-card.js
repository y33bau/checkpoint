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
  const maps=game.maps.map(map=>'<a class="entry" href="'+esc(web(map.url))+'" rel="noopener noreferrer" target="_blank">'+esc(map.name)+'</a>').join('');
  const goals=game.tasks.map((task,index)=>goalRow(task,index)).join('');
  return '<div class="game-section-grid"><section class="panel feature-panel"><div class="row"><h2>'+t('Cele')+'</h2>'+
    btn(t('＋ Dodaj cel'),'task','primary')+'</div>'+
    (goals||'<p class="muted">'+t('Dodaj pierwszy cel dla tej gry.')+'</p>')+'</section>'+
    '<section class="panel feature-panel"><div class="row"><h2>'+t('Mapy')+'</h2>'+
    btn(t('＋ Dodaj mapę'),'map')+'</div>'+
    (maps||'<p class="muted">'+t('Przypnij link do mapy gry.')+'</p>')+'</section></div>';
}

function gameRatings(game) {
  const mean=score(game);
  const total=mean===null?'—':mean.toLocaleString(appLocale(),{minimumFractionDigits:1,maximumFractionDigits:1});
  return '<div class="game-section-grid"><div><section class="panel feature-panel"><div class="row"><h2>'+t('Twoja ocena')+'</h2>'+
    btn(t('Oceń grę'),'rate','primary')+'</div>'+
    '<p class="game-score"><span class="number">'+total+'</span> / 10</p></section>'+criticScoresPanel(game)+startRatingPanel(game)+'</div>'+
    '<div>'+chroniclePanel(game)+'</div></div>';
}

const gameTabs={overview:'Przegląd',goals:'Mapy i cele',ratings:'Oceny i kronika'};
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
  return pageHeading(t('Karta gry'),btn(t('Edytuj'),'edit'))+
    banner(game,'<p>'+esc(game.catalog)+'</p><div class="actions">'+btn(t('Zapisz sesję'),'session','primary')+
      youtubeGuide(game)+playingToggle(game)+queueToggle(game)+'</div>')+
    '<div class="game-tabs" role="group" aria-label="'+t('Sekcje karty gry')+'">'+tabs+'</div>'+
    views[currentGameTab]();
}

function renderRankings() {
  const ranked=games.filter(game=>score(game)!==null).sort((a,b)=>score(b)-score(a));
  const number=new Intl.NumberFormat(appLocale(),{minimumFractionDigits:1,maximumFractionDigits:1});
  return pageHeading(t('Ranking'))+(ranked.length?'<div class="rank-list">'+ranked.map((game,index)=>
    '<button class="entry rank-row" data-game="'+esc(game.id)+'"><span class="rank-place">'+(index+1)+'</span>'+
    '<span class="cover" aria-hidden="true">'+coverImage(game)+'</span>'+
    '<span class="rank-title"><strong>'+esc(game.title)+'</strong><small>'+esc(Object.keys(game.runs).join(' · '))+'</small></span>'+
    '<span class="rank-score"><strong>'+number.format(score(game))+'</strong> / 10</span></button>').join('')+'</div>':
    '<div class="panel empty-library"><h2>'+t('Jaką grę oceniasz najwyżej?')+'</h2><p>'+t('Wybierz grę z biblioteki i oceń ją, aby rozpocząć ranking.')+
    '</p><a href="#library" class="button primary">'+t('Wybierz grę')+'</a></div>');
}
