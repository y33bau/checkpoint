const moods = {calm:'Na luzie',action:'Akcja',story:'Fabularnie',challenge:'Wyzwanie'};
let departures = [];

async function loadGamePass() {
  const urls = [
    'https://raw.githubusercontent.com/y33bau/checkpoint/news-data/gamepass.json',
    'assets/gamepass.json?v=afterglow9',
  ];
  for(const url of urls){
    try {
      const response=await fetch(url,{signal:AbortSignal.timeout(5000)});
      if(!response.ok)continue;
      const rows=await response.json();
      if(!Array.isArray(rows))continue;
      departures=rows.filter(row=>typeof row?.title==='string' && /^\d{4}-\d\d-\d\d$/.test(row.date) &&
        web(row.url)?.startsWith('https://news.xbox.com/'));
      if(active() || ['', '#now','#library'].includes(location.hash)) {
        if(!dialog.open && !recording)render();
      }
      return;
    }catch{continue}
  }
}

function gamePassNotice(game,link=false) {
  if(!game.runs.Xbox)return '';
  const today=new Date().toLocaleDateString('sv-SE');
  const title=catalogText(game.title);
  const match=departures.find(row=>row.date>=today && catalogText(row.title)===title);
  if(!match)return '';
  const date=new Intl.DateTimeFormat(appLocale(),{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(match.date));
  const text=t('Opuszcza Game Pass')+' · '+date;
  return link?'<a class="pass-notice" href="'+esc(match.url)+'" target="_blank" rel="noopener noreferrer">'+text+'</a>':
    '<small class="pass-notice">'+text+'</small>';
}

const eveningDurations = {30:'30 min',60:'1 h',120:'2 h',180:'3 h',unlimited:'Bez limitu'};
const eveningOrders = {
  default:'Metacritic + Steam',
  steam:'Steam (opinie graczy)',
  metacritic:'Metacritic (oceny krytyków)',
};
const eveningScopes={playing:'Kontynuuj',queue:'Z mojej kolejki',library:'Cała biblioteka',catalogue:'Katalog'};

function compareEveningRatings(a,b) {
  return (b?.value??-1)-(a?.value??-1)||(b?.reviews??0)-(a?.reviews??0);
}

function rankEveningHit(order,critic,review) {
  const meta=Number.isInteger(critic)?critic:null;
  const steam=review?.reviews>=1000?review:null;
  const provenSteam=steam?.reviews>=5000&&steam.value>=.90;
  if(order==='steam'&&!provenSteam)return;
  if(order==='metacritic'&&!(meta>=87))return;
  if(order==='default'&&!(meta>=87||provenSteam||(meta>=80&&steam?.value>=.88)))return;
  const adjusted=steam?(steam.value*steam.reviews+850)/(steam.reviews+1000)*100:0;
  const value=order==='steam'?adjusted:order==='metacritic'?meta:
    meta!==null&&steam?meta*.55+adjusted*.45+2:(meta??adjusted)-3;
  return {value,critic:meta,steam,reviews:steam?.reviews};
}

async function eveningRatingData(order,needGenres) {
  const [critics,steam]=await Promise.allSettled([
    order==='steam'&&!needGenres?Promise.resolve(null):criticIndex(),
    steamReviewIndex(),
  ]);
  return {critics:critics.value,steam:steam.value,genres:genreIndex,
    partial:critics.status==='rejected'||steam.status==='rejected'};
}

function eveningRatingLookup({critics,steam},order) {
  return (game,platform)=>{
    const versions=game.catalogVersions?.[platform]||game.versions||[];
    const critic=game.criticScores?.[platform]?.critics??
      (critics&&matchCriticScore(critics,game.title,platform,versions)?.critics);
    const review=steam&&findSteamReview(steam,game);
    return rankEveningHit(order,critic,review);
  };
}

function eveningRatingMarkup(order,rating) {
  if(!rating)return '';
  const badges=[];
  if(order!=='steam'&&rating.critic!==null){
    badges.push('<span>Metacritic <strong>'+rating.critic+'/100</strong></span>');
  }
  if(order!=='metacritic'&&rating.steam){
    const {value,reviews}=rating.steam;
    const percent=value.toLocaleString(appLocale(),{style:'percent',maximumFractionDigits:0});
    badges.push('<span>Steam <strong>'+esc(percent)+'</strong> · '+
      esc(reviews.toLocaleString(appLocale()))+' '+t('opinii')+'</span>');
  }
  return badges.length?'<div class="evening-ratings">'+badges.join('')+'</div>':'';
}

function eveningRatingSource(order) {
  const sources=[];
  if(order!=='steam')sources.push([criticProject,'Metacritic · '+t('Dane z migawki 7.10.2025')]);
  if(order!=='metacritic')sources.push([steamReviewProject,'The Game Census · CC BY 4.0']);
  return '<small class="evening-rating-sources">'+sources.map(([url,label])=>
    '<a class="text-link" href="'+url+'" target="_blank" rel="noopener noreferrer">'+esc(label)+'</a>').join(' · ')+'</small>';
}

let eveningDuration;
let eveningSettings;

function eveningPanel() {
  const choices=Object.entries(eveningDurations).map(([id,label])=>
    '<button type="button" data-act="evening:'+id+'" aria-pressed="'+(id===eveningDuration)+'">'+t(label)+'</button>').join('');
  return '<section class="panel feature-panel evening-panel" aria-labelledby="evening-title">'+
    '<div class="evening-heading"><div><h2 id="evening-title">'+t('Mam czas na grę')+'</h2>'+
    '<p>'+t('Wybierz czas. Znajdź grę.')+'</p></div>'+
    btn(t('Zmień filtry'),'evening-filters','evening-filter-button')+'</div>'+
    '<div class="evening-durations" role="group" aria-label="'+t('Czas na grę')+'">'+choices+
    '</div><div id="evening-results" aria-live="polite"></div></section>';
}

function savedEveningSettings() {
  const saved=preferences.evening||{};
  return {
    scope:Object.hasOwn(eveningScopes,saved.scope)?saved.scope:'catalogue',
    order:Object.hasOwn(eveningOrders,saved.order)?saved.order:'default',
    platform:saved.platform??'',
    mood:saved.mood||'',genre:saved.genre||'',ratedOnly:saved.ratedOnly??true,
  };
}

function pickEveningDuration(duration,settings=savedEveningSettings()) {
  eveningDuration=duration;
  eveningSettings=settings;
  for(const button of app.querySelectorAll('[data-act^="evening:"]')){
    button.setAttribute('aria-pressed',String(button.dataset.act==='evening:'+duration));
  }
  const result=app.querySelector('#evening-results');
  if(result)showEveningPicks(result,duration==='unlimited'?null:Number(duration),settings,++drawRequest);
}

function eveningPicks(minutes,mood,platform,rate,{scope='library',genre='',ratedOnly=false,limit=3}={}) {
  const candidates=games.filter(game=>!game.archived&&(!platform||game.runs[platform])&&
    (scope!=='playing'||game.status==='Gram')&&(scope!=='queue'||game.pinnedAt)&&
    (!genre||gameGenre(game)===genre)).flatMap(game=>{
    const saved=game.sessionHint || {};
    const hint={minutes:Number.isFinite(saved.minutes)?saved.minutes:0,mood:Object.hasOwn(moods,saved.mood)?saved.mood:''};
    const timing=estimateTimeFit(minutes,hint.minutes);
    if(timing===1 || (mood && hint.mood!==mood))return [];
    const selectedPlatform=platform||game.system;
    const score=scoreForSession(game,selectedPlatform,timing);
    const rating=rate?.(game,selectedPlatform);
    if(ratedOnly&&!rating)return [];
    return [{game,hint,timing,score,rating}];
  });
  return candidates.sort((a,b)=>compareEveningRatings(a.rating,b.rating)||
    (b.score?.value??-1)-(a.score?.value??-1)||(b.timing??0)-(a.timing??0)||
    Number(Boolean(b.game.pinnedAt))-Number(Boolean(a.game.pinnedAt))||(a.game.title||a.game.id).localeCompare(b.game.title||b.game.id)).slice(0,limit);
}

let drawnCatalogue=[];
let drawRequest=0;
let eveningPage;

function renderEveningPage(result,page) {
  const rows=page.choices.slice(page.offset,page.offset+3);
  const html=rows.map((item,index)=>{
    const game=item.game;
    const platform=game?(page.platform||game.system):item.store;
    const name=game?.title||item.title;
    const title=esc(name);
    const initial=Array.from(name.trim())[0]||'';
    const cover=game?coverImage(game):item.cover?'<img loading="lazy" alt="" src="'+esc(item.cover)+'">':'';
    const titleAction=game?'data-game="'+esc(game.id)+'"':'data-act="draw-add:'+(page.offset+index)+'"';
    const queueAction=game?'library:'+esc(game.id):'catalogue:'+(page.offset+index);
    const queued=(game||libraryMatch(item))?.pinnedAt;
    const run=game?.runs[platform];
    const reasons=[];
    if(item.hint?.minutes)reasons.push(t('Typowa sesja')+' · '+item.hint.minutes+' min');
    if(run?.goal||game?.tasks?.some(task=>task.pinned&&!task.done))reasons.push(t('Masz zapisany następny cel'));
    if(queued)reasons.push(t('Z Twojej kolejki'));
    if(!reasons.length)reasons.push(t('Czas sesji nieustalony'));
    const status=[game?.status==='Gram'?t('Gram teraz'):'',game?.demo?t('Demo'):''];
    const details=item.score?'<small>'+esc(t(item.score.verdict))+' · '+
      item.score.value.toLocaleString(appLocale(),{maximumFractionDigits:2})+' / 5</small>':'';
    return '<li class="evening-pick">'+
      '<span class="evening-cover" aria-hidden="true"><b>'+esc(initial)+'</b>'+cover+'</span><div class="evening-pick-text">'+
      '<button type="button" class="evening-game-link" '+titleAction+'>'+title+'</button>'+
      '<small>'+[platform,...status].filter(Boolean).map(esc).join(' · ')+'</small>'+
      '<small class="evening-reason">'+esc(reasons[0])+'</small>'+eveningRatingMarkup(page.order,item.rating)+details+'</div>'+
      '<button type="button" class="evening-queue-button" data-act="evening-queue:'+queueAction+'"'+
      (queued?' disabled':'')+'>'+t(queued?'W kolejce':'Do kolejki')+'</button></li>';
  }).join('');
  result.innerHTML=(page.notice?'<p class="muted">'+t(page.notice)+'</p>':'')+
    (rows.length?'<h3>'+t('Propozycje na teraz')+'</h3><ul class="evening-picks">'+html+'</ul>':
      '<p class="muted">'+t(page.empty)+'</p>')+eveningRatingSource(page.order)+
    (page.offset+3<page.choices.length?'<div class="library-more">'+btn(t('Pokaż kolejne'),'evening-more')+'</div>':'')+
    (!rows.length?'<div class="actions">'+btn(t('Zmień filtry'),'evening-filters')+
      (page.scope==='catalogue'?'':btn(t('Zobacz gry z katalogu'),'evening-catalogue'))+
      (games.some(game=>!game.archived&&game.pinnedAt)?btn(t('Zobacz całą kolejkę'),'evening-shelf'):'')+'</div>':'');
}

function currentEveningDraw(result,ticket) {
  return ticket===drawRequest&&document.querySelector('#evening-results')===result;
}

function nextEveningPage() {
  const result=document.querySelector('#evening-results');
  if(!result||!eveningPage||eveningPage.offset+3>=eveningPage.choices.length)return;
  eveningPage.offset+=3;
  renderEveningPage(result,eveningPage);
  result.querySelector('.evening-game-link')?.focus({preventScroll:true});
}

function queueEveningPick(kind,id) {
  const choice=kind==='catalogue'?drawnCatalogue[Number(id)]:null;
  if(choice)placeCatalogueGame('queue',choice,choice.store);
  else {
    const item=games.find(game=>game.id===id&&!game.archived);
    if(!item)return;
    placeGame('queue',item);
  }
  persist();
  const button=[...app.querySelectorAll('#evening-results [data-act^="evening-queue:"]')]
    .find(button=>button.dataset.act==='evening-queue:'+kind+':'+id);
  if(button){button.disabled=true;button.textContent=t('W kolejce')}
  render();
  button?.closest('.evening-pick')?.querySelector('.evening-game-link')?.focus({preventScroll:true});
}

async function showEveningPicks(result,minutes,settings,ticket) {
  const {scope,platform,order,mood,genre,ratedOnly}=settings;
  drawnCatalogue=[];
  eveningPage=null;
  result.innerHTML='<div class="evening-loading" role="status"><span aria-hidden="true"></span>'+
    t('Szukam najlepszych gier…')+'</div>';
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  if(!currentEveningDraw(result,ticket))return;

  const data=await eveningRatingData(order,Boolean(genre));
  if(!currentEveningDraw(result,ticket))return;
  const rate=eveningRatingLookup(data,order);
  const catalogue=scope==='catalogue';
  const choices=catalogue?rankedCatalogueGames(data,platform,genre,order):
    eveningPicks(minutes,mood,platform,rate,{scope,genre,ratedOnly,limit:Infinity});
  const unavailable=order==='steam'?!data.steam:order==='metacritic'?!data.critics:
    !data.steam&&!data.critics;
  const empty=unavailable?'Oceny chwilowo niedostępne. Spróbuj ponownie lub zmień sortowanie.':
    catalogue||ratedOnly?'Brak wysoko ocenionych gier dla tych filtrów.':'Brak pasujących gier w bibliotece. Zmień kryteria.';
  const notice=data.partial&&!unavailable?'Jedno lub więcej źródeł ocen jest niedostępnych.':'';
  if(catalogue)drawnCatalogue=choices;
  eveningPage={scope,platform,order,choices,notice,empty,offset:0};
  renderEveningPage(result,eveningPage);
}

function openEvening(duration=eveningDuration||'30') {
  const saved=eveningSettings||savedEveningSettings();
  const {order,scope,platform}=saved;
  const scopes=Object.entries(eveningScopes).map(([id,label])=>
    '<label><input type="radio" name="draw-mode" value="'+id+'"'+(scope===id?' checked':'')+'><span>'+t(label)+'</span></label>').join('');
  openForm(t('Wybierz grę na wieczór'),
    '<fieldset class="evening-scopes"><legend>'+t('Zakres wyboru')+'</legend><div>'+scopes+'</div></fieldset>'+
    select(t('Platforma'),'platform',['',...systems],platform,value=>value||t('Dowolna'))+
    select(t('Sortowanie'),'evening-order',Object.keys(eveningOrders),order,id=>t(eveningOrders[id]))+
    '<label id="evening-duration">'+t('Czas na grę')+'<select name="duration">'+
    options(Object.keys(eveningDurations),duration,id=>t(eveningDurations[id]))+'</select></label>'+
    '<details class="extra-options"'+(saved.mood||saved.genre||saved.ratedOnly?' open':'')+'><summary>'+t('Więcej filtrów')+'</summary>'+
    '<div id="evening-mood">'+
    select(t('Nastrój'),'mood',['',...Object.keys(moods)],saved.mood,id=>t(moods[id]||'Dowolny'))+'</div>'+
    '<div>'+
    select(t('Gatunek'),'evening-genre',['',...gameGenres],saved.genre,id=>t(id||'Wszystkie gatunki'))+'</div>'+
    '<label class="compact-check"><input type="checkbox" name="rated-only"'+(saved.ratedOnly?' checked':'')+'>'+
    t('Tylko gry z oceną')+'</label></details>',()=>{});
  document.querySelector('#save').textContent=t('Pokaż propozycje');
  const {duration:durationField,mood}=form.elements;
  const genre=form.elements['evening-genre'];
  const rated=form.elements['rated-only'];
  const sorting=form.elements['evening-order'];
  const modes=form.elements['draw-mode'];
  function syncScope() {
    const catalogue=modes.value==='catalogue';
    fields.querySelector('#evening-duration').hidden=catalogue;
    fields.querySelector('#evening-mood').hidden=catalogue;
    durationField.disabled=mood.disabled=rated.disabled=catalogue;
    rated.closest('label').hidden=catalogue;
  }
  for(const radio of modes)radio.onchange=syncScope;
  syncScope();
  form.onsubmit=event=>{
    event.preventDefault();
    const data=new FormData(form);
    const settings={
      scope:data.get('draw-mode'),platform:data.get('platform'),order:sorting.value,
      mood:data.get('mood')||'',genre:genre.value,ratedOnly:rated.checked,
    };
    preferences.evening=settings;
    savePreferences();
    dialog.close();
    pickEveningDuration(data.get('duration')||duration,settings);
  };
}

function editSessionHint(game) {
  const hint=game.sessionHint || {};
  openForm(t('Profil krótkiej sesji'),
    input(t('Typowa sesja (min)'),'minutes',hint.minutes??'','type="number" min="5" max="600"')+
    '<label>'+t('Nastrój')+'<select name="mood"><option value="">'+t('Dowolny')+'</option>'+
    Object.entries(moods).map(([id,label])=>'<option value="'+id+'" '+(id===hint.mood?'selected':'')+'>'+t(label)+'</option>').join('')+'</select></label>',data=>{
    game.sessionHint={minutes:Number(data.get('minutes')),mood:data.get('mood')};
  });
}

function lastPlayedMarkup(run) {
  const imported=Number.isFinite(run.importedPlayedAt)?run.importedPlayedAt:0;
  const timestamp=Math.max(imported,run.sessions.reduce((latest,session)=>Math.max(latest,historicalSessionTime(session)),0));
  const date=new Date(timestamp);
  if(timestamp<=0||!Number.isFinite(date.valueOf()))return '';
  const today=new Date();
  const calendarDay=value=>Date.UTC(value.getFullYear(),value.getMonth(),value.getDate());
  const days=Math.max(0,Math.round((calendarDay(today)-calendarDay(date))/86400000));
  const label=new Intl.RelativeTimeFormat(appLocale(),{numeric:'auto'}).format(-days,'day');
  return '<p class="resume-last-played">'+t('Ostatnio grane')+' · <time datetime="'+date.toISOString()+
    '" title="'+esc(date.toLocaleDateString(appLocale()))+'">'+esc(label)+'</time></p>';
}

function resumeNote(run) {
  return run.resumeNote||run.sessions.findLast(session=>session.note?.trim())?.note||'';
}

function featuredReturnPanel(game,run) {
  const note=resumeNote(run);
  const goal=run.goal||game.tasks.find(task=>task.pinned&&!task.done)?.name;
  const noteItem=note?'<div><dt>'+t('Gdzie skończyłem')+'</dt><dd>'+esc(note)+'</dd></div>':'';
  const goalItem=goal?'<div><dt>'+t('Następny cel')+'</dt><dd>'+esc(goal)+'</dd></div>':'';
  return '<section class="featured-resume" aria-labelledby="featured-resume-title">'+
    '<div class="row"><h3 id="featured-resume-title">'+t('Wróć do gry')+'</h3>'+
    '<button type="button" class="resume-edit" data-act="edit-return" aria-label="'+esc(t('Edytuj kartę powrotu'))+'">'+t('Edytuj')+'</button></div>'+
    lastPlayedMarkup(run)+
    (noteItem||goalItem?'<dl class="resume-details">'+noteItem+goalItem+'</dl>':
      '<p class="muted resume-empty">'+t('Zapisz, gdzie skończyłeś, albo dodaj kolejny cel.')+'</p>')+
    '<div id="featured-voice"></div></section>';
}

function returnPanel(game,run) {
  const recent=run.sessions.at(-1);
  const pinned=game.tasks.map((task,index)=>({task,index})).filter(({task})=>task.pinned&&!task.done).slice(0,3);
  return '<section class="panel feature-panel"><div class="row"><h2>'+t('Wróć do gry')+'</h2>'+
    btn(t('Edytuj kartę powrotu'),'edit-return')+'</div>'+
    '<div class="return-grid"><div><small>'+t('Gdzie skończyłem')+'</small><p>'+esc(run.resumeNote||recent?.note||t('Dodaj krótką notatkę o ostatniej sesji.'))+'</p></div>'+
    '<div><small>'+t('Następny cel')+'</small><p>'+esc(run.goal||t('Zapisz kolejny cel po sesji.'))+'</p></div></div>'+
    (pinned.length?'<div class="return-tasks">'+pinned.map(({task,index})=>goalRow(task,index,false)).join('')+'</div>':'')+
    '<div class="actions">'+btn(t('Profil krótkiej sesji'),'edit-hint')+'</div></section>';
}

function editReturn(game) {
  const run=game.runs[game.system];
  openForm(t('Karta powrotu'),
    '<label>'+t('Gdzie skończyłem')+'<textarea name="resume" rows="3" maxlength="1000">'+esc(resumeNote(run))+'</textarea></label>'+
    input(t('Następny cel'),'goal',run.goal,'maxlength="180"'),data=>{
      run.resumeNote=data.get('resume').trim();
      run.goal=data.get('goal').trim();
    });
}

function goalRow(task,index,allowPin=true) {
  return '<div class="goal-row"><label><input type="checkbox" data-task="'+index+'" '+(task.done?'checked':'')+'>'+esc(task.name)+'</label>'+
    (allowPin?'<button data-act="pin-goal:'+index+'" aria-pressed="'+Boolean(task.pinned)+'" aria-label="'+
      esc(t(task.pinned?'Odepnij cel':'Przypnij cel')+' · '+task.name)+'">'+(task.pinned?'★':'☆')+'</button>':'')+'</div>';
}

function toggleGoalPin(game,index) {
  const task=game.tasks[index];
  if(!task)return;
  if(!task.pinned && game.tasks.filter(goal=>goal.pinned).length>=3){
    window.alert(t('Możesz przypiąć maksymalnie trzy cele.'));
    return;
  }
  task.pinned=!task.pinned;
  persist();
  render();
}

function chroniclePanel(game) {
  const review=game.chronicle?.review || '';
  return '<section class="panel feature-panel"><h2>'+t('Kronika gracza')+'</h2>'+
    (review?'<p class="review-text">'+esc(review)+'</p>':'<p class="muted">'+t('Zapisz wrażenia, dodaj zrzut i przygotuj kartę do udostępnienia.')+'</p>')+
    '<div class="actions">'+btn(t('Napisz recenzję'),'chronicle-edit')+
    '<label class="attachment-picker">'+t('Dodaj zrzut')+'<input type="file" id="chronicle-file" accept="image/png,image/jpeg,image/webp"></label>'+
    btn(t('Przygotuj kartę'),'chronicle-generate','primary')+'</div>'+
    '<div id="chronicle-screenshot"></div><p id="chronicle-status" role="status"></p><div id="chronicle-card"></div></section>';
}

function editChronicle(game) {
  openForm(t('Kronika gracza'),'<label>'+t('Krótka recenzja')+'<textarea name="review" maxlength="500" rows="4">'+esc(game.chronicle?.review||'')+'</textarea></label>',data=>{
    game.chronicle={review:data.get('review').trim()};
  });
}

function chronicleStatus(label) {
  const status=document.querySelector('#chronicle-status');
  if(status)status.textContent=t(label);
}

async function saveScreenshot(game,file) {
  if(!game||!file||deviceBusy)return;
  if(file.size>8*1024*1024 || !/^image\/(png|jpeg|webp)$/.test(file.type)){
    chronicleStatus('Wybierz zrzut PNG, JPEG lub WebP do 8 MB.');
    return;
  }
  try {
    await saveMedia({id:'shot-'+game.id,gameId:game.id,kind:'screenshot',created:Date.now(),blob:file});
    if(active()?.id===game.id)render();
  }catch{chronicleStatus('Zapis mediów jest niedostępny.')}
}

function drawLines(ctx,text,x,y,width,lineHeight,maxLines) {
  const words=text.split(/\s+/);
  for(let line=0;line<maxLines && words.length;line++){
    let content=words.shift();
    while(words.length && ctx.measureText(content+' '+words[0]).width<=width)content+=' '+words.shift();
    if(line===maxLines-1 && words.length)content+='…';
    ctx.fillText(content,x,y+line*lineHeight,width);
  }
}

async function cardBitmap(blob) {
  try {return blob?await createImageBitmap(blob):null}catch{return null}
}

function drawCardImage(ctx,bitmap,x,y,width,height) {
  const scale=Math.max(width/bitmap.width,height/bitmap.height);
  const w=width/scale,h=height/scale;
  ctx.drawImage(bitmap,(bitmap.width-w)/2,(bitmap.height-h)/2,w,h,x,y,width,height);
  bitmap.close();
}

let preparedCard;
async function prepareChronicle(game) {
  if(!game)return;
  chronicleStatus('Przygotowuję kartę…');
  try {
    const media=await gameMedia(game.id).catch(()=>[]);
    const shot=media.find(row=>row.gameId===game.id&&row.kind==='screenshot');
    const art=gameCoverSource(game);
    const [cover,screenshot,brandMark]=await Promise.all([
      art?fetch(art,{signal:AbortSignal.timeout(6000)}).then(response=>response.blob()).then(cardBitmap).catch(()=>null):null,
      cardBitmap(shot?.blob),
      fetch('assets/checkpoint-neon-192.png',{signal:AbortSignal.timeout(3500)}).then(response=>response.ok?response.blob():null).then(cardBitmap).catch(()=>null),
    ]);
    const canvas=document.createElement('canvas');
    canvas.width=1080;canvas.height=720;
    const ctx=canvas.getContext('2d');
    const bg=ctx.createLinearGradient(0,0,1080,720);
    bg.addColorStop(0,'#151125');bg.addColorStop(1,'#42283e');
    ctx.fillStyle=bg;ctx.fillRect(0,0,1080,720);
    if(screenshot){drawCardImage(ctx,screenshot,0,0,1080,720);ctx.fillStyle='#0e0a19dc';ctx.fillRect(0,0,1080,720)}
    if(cover)drawCardImage(ctx,cover,770,105,264,396);
    if(brandMark) drawCardImage(ctx,brandMark,60,30,60,60);
    ctx.fillStyle='#ffb1b8';ctx.font='700 26px system-ui';ctx.fillText('CHECKPOINT',brandMark?134:60,70);
    ctx.fillStyle='#fff1f6';ctx.font='800 58px system-ui';
    drawLines(ctx,game.title,60,172,cover?650:920,68,3);
    const rating=score(game);
    const time=(libraryMetrics(game).minutes/60).toLocaleString(appLocale(),{maximumFractionDigits:1});
    ctx.fillStyle='#94e4d5';ctx.font='700 28px system-ui';
    ctx.fillText((rating===null?'':rating.toLocaleString(appLocale(),{maximumFractionDigits:1})+' / 10  ·  ')+time+' h',60,417);
    ctx.fillStyle='#f1dce9';ctx.font='400 26px system-ui';
    drawLines(ctx,game.chronicle?.review||'',60,472,cover?650:920,34,6);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!blob)throw Error('Image unavailable');
    if(active()?.id!==game.id || !document.querySelector('#chronicle-card'))return;
    preparedCard=new File([blob],'checkpoint-kronika.png',{type:'image/png'});
    const container=document.querySelector('#chronicle-card');
    const url=URL.createObjectURL(blob);mediaUrls.push(url);
    container.innerHTML='<img src="'+esc(url)+'" alt="'+t('Karta gry')+'"><div class="actions">'+
      (navigator.canShare?.({files:[preparedCard]})?btn(t('Udostępnij'),'chronicle-share','primary'):'')+
      btn(t('Pobierz kartę PNG'),'chronicle-download')+'</div>';
    chronicleStatus(art&&!cover?'Karta gotowa. Sklep nie udostępnił okładki do eksportu.':'Karta gotowa.');
  }catch{chronicleStatus('Nie udało się przygotować karty.')}
}

function openSessionForm(game, quick) {
  const run=game.runs[game.system];
  const minutes=input(t('Czas gry (min)'),'minutes',30,'type="number" min="1" max="1440" required');
  const progress=input(t('Postęp (%)'),'progress',run.progress,'type="number" min="0" max="100" required');
  const notes=input(t('Co udało się zrobić?'),'note')+input(t('Następny cel'),'goal',run.goal);
  const presets=[15,30,60].map(value=>'<button type="button" data-minutes="'+value+'" aria-pressed="'+(value===30)+'">'+value+' min</button>').join('');
  const extras=quick?'<details><summary>'+t('Dodaj szczegóły')+'</summary>'+notes+'</details>':notes;
  openForm(t('Zapisz sesję'),(quick?'<p>'+esc(game.title)+'</p><div class="session-presets">'+presets+'</div>':'')+
    minutes+progress+(quick?'<div class="session-voice">'+voiceButton()+'</div><p data-session-media-status role="status"></p>':'')+extras,data=>{
      const playedAt=Date.now();
      const note=data.get('note').trim();
      run.sessions.push({playedAt,date:new Date(playedAt).toLocaleDateString(appLocale()),minutes:Number(data.get('minutes')),note});
      run.goal=data.get('goal');
      if(note)run.resumeNote=note;
      run.progress=Number(data.get('progress'));
    });
  if(!quick)return;
  dialog.classList.add('quick-sheet');
  const duration=form.elements.minutes;
  const buttons=[...fields.querySelectorAll('[data-minutes]')];
  const markDuration=()=>buttons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.minutes===duration.value)));
  duration.addEventListener('input',markDuration);
  for(const button of buttons)button.onclick=()=>{duration.value=button.dataset.minutes;markDuration()};
  fields.querySelector('.session-voice button').onclick=()=>toggleVoice(game);
}

function syncSessionVoice() {
  const target=fields.querySelector('.session-voice button');
  if(!dialog.open||!target)return;
  target.textContent=t(voiceLabel());
  target.disabled=Boolean(recording&&recording.state!=='recording');
}
