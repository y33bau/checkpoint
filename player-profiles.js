const playerPlatforms={xbox:'Xbox',steam:'Steam',ps:'PlayStation'};

function platformPlaySummary(entries,platform) {
  let count=0,minutes=0,recent=null;
  for(const game of entries){
    const run=game.runs[platform];
    if(game.archived||!run)continue;
    count++;
    let logged=0;
    let last=Number.isFinite(run.importedPlayedAt)?run.importedPlayedAt:0;
    for(const session of run.sessions){
      logged+=session.minutes||0;
      last=Math.max(last,historicalSessionTime(session));
    }
    minutes+=Math.max(logged,Number.isFinite(run.importedMinutes)?run.importedMinutes:0);
    if(last>0&&(!recent||last>recent.time))recent={title:game.title,time:last};
  }
  return {count,minutes,recent};
}

function homePlayerProfiles() {
  const number=new Intl.NumberFormat(appLocale(),{maximumFractionDigits:1});
  const cards=Object.entries(playerPlatforms).flatMap(([id,platform])=>{
    const saved=connections[id];
    const identity=typeof saved?.profile==='string'?saved.profile.trim():'';
    if(!identity)return [];
    const {count,minutes,recent}=platformPlaySummary(games,platform);
    const nameLabel=id==='steam'?'ID Steam (17 cyfr)':id==='ps'?'PSN Online ID':'Gamertag';
    const caption='<p class="player-card-id" title="'+esc(t(nameLabel))+'">'+esc(identity)+'</p>';
    const gamesButton=count?'<button type="button" data-act="player-games:'+id+'" aria-label="'+esc(t('Pokaż gry')+' · '+platform)+'">'+t('Pokaż gry')+'</button>':'';
    const profileLink=id==='steam'&&/^\d{17}$/.test(identity)?
      resourceLink(t('Otwórz profil'),'https://steamcommunity.com/profiles/'+identity+'/'):
      '<a class="button" href="#connections">'+t('Połączenia')+'</a>';
    return '<article class="player-platform-card '+id+'" aria-label="'+esc(platform)+'">'+
      '<div class="player-card-heading"><span class="provider-mark" aria-hidden="true"><img src="assets/'+id+'.svg" alt="" width="22" height="22"></span>'+
      '<div><h3>'+esc(platform)+'</h3>'+caption+'</div></div>'+
      '<dl class="player-card-stats"><div><dt>'+t('Gry w bibliotece')+'</dt><dd>'+number.format(count)+'</dd></div>'+
      '<div><dt>'+t('Czas gry')+'</dt><dd>'+number.format(minutes/60)+' h</dd></div></dl>'+
      (recent?'<p class="player-card-recent"><small>'+t('Ostatnio grane')+'</small><strong>'+esc(recent.title)+'</strong></p>':'')+
      '<div class="player-card-actions">'+gamesButton+profileLink+'</div></article>';
  });
  if(!cards.length)return '';
  return '<section class="home-player-profiles" aria-labelledby="home-player-title"><h2 id="home-player-title">'+t('Profile gracza')+
    '</h2><div class="home-player-grid" data-count="'+cards.length+'">'+cards.join('')+'</div></section>';
}
