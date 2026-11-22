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

function eveningPanel() {
  return '<section class="panel feature-panel evening-panel"><div class="row"><div><h2>'+t('Mam 45 minut')+'</h2>'+
    '<p class="muted">'+t('Losuj z biblioteki albo odkryj grę z katalogu.')+'</p></div>'+
    btn(t('Wybierz grę na wieczór'),'evening')+'</div><div id="evening-results"></div></section>';
}

function eveningPicks(minutes,mood,platform) {
  const candidates=games.filter(game=>!platform||game.runs[platform]).flatMap(game=>{
    const saved=game.sessionHint || {};
    const hint={minutes:Number.isFinite(saved.minutes)?saved.minutes:0,mood:Object.hasOwn(moods,saved.mood)?saved.mood:''};
    const timing=estimateTimeFit(minutes,hint.minutes);
    if(timing===1 || (mood && hint.mood && hint.mood!==mood))return [];
    const selectedPlatform=platform||game.system;
    const score=scoreForSession(game,selectedPlatform,timing);
    return [{game,hint,timing,score,random:Math.random()}];
  });
  return candidates.sort((a,b)=>(b.score?.value??-1)-(a.score?.value??-1)||(b.timing??0)-(a.timing??0)||Number(Boolean(b.game.pinnedAt))-Number(Boolean(a.game.pinnedAt))||a.random-b.random).slice(0,3);
}

let drawnCatalogue=[];
let drawRequest=0;

function renderLibraryPicks(result,minutes,mood,platform) {
  drawnCatalogue=[];
  const picks=eveningPicks(minutes,mood,platform);
  result.innerHTML=picks.length ? picks.map(({game,hint,timing,score})=>
    '<button class="entry evening-pick" data-game="'+esc(game.id)+'">'+
      '<span><strong>'+esc(game.title)+'</strong><small>'+esc(Object.keys(game.runs).join(' · '))+' · '+
      (hint.minutes?hint.minutes+' min':t('Czas sesji nieustalony'))+' · '+
      (Object.hasOwn(moods,hint.mood)?t(moods[hint.mood]):t('Nastrój nieustalony'))+'</small>'+
      (timing?'<small>'+t('Dopasowanie do sesji')+' · '+timing+' / 10</small>':'')+
      (score?startBadge(score):'')+gamePassNotice(game)+'</span></button>').join('') :
    '<p class="muted">'+t('Brak pasujących gier w bibliotece. Zmień kryteria.')+'</p>';
}

async function renderCataloguePicks(result,platform,ticket) {
  result.innerHTML='<p role="status">'+t('Losuję z katalogu…')+'</p>';
  const choices=await drawCatalogueGames(platform);
  if(ticket!==drawRequest||document.querySelector('#evening-results')!==result)return;
  drawnCatalogue=choices;
  result.innerHTML=choices.length?choices.map((item,index)=>
    '<div class="entry discovery-row">'+(item.cover?'<img loading="lazy" alt="" src="'+esc(item.cover)+'">':'')+
    '<div><strong>'+esc(item.title)+'</strong><p class="muted">'+esc(item.store)+'</p></div>'+
    btn(t('Dodaj grę'),'draw-add:'+index)+'</div>').join(''):'<p class="muted">'+t('Katalog chwilowo niedostępny. Spróbuj ponownie.')+'</p>';
}

function openEvening() {
  openForm(t('Mam 45 minut'),
    '<label>'+t('Źródło losowania')+'<select name="draw-mode"><option value="library">'+t('Z mojej biblioteki')+
    '</option><option value="catalogue">'+t('Dowolna gra z katalogu')+'</option></select></label>'+
    '<label>'+t('Platforma')+'<select name="platform"><option value="">'+t('Dowolna')+'</option>'+
    options(systems,preferences.profile?.platform)+'</select></label>'+
    '<div id="evening-constraints">'+input(t('Mam czasu (min)'),'minutes',45,'type="number" min="5" max="600" required')+
    '<label>'+t('Nastrój')+'<select name="mood"><option value="">'+t('Dowolny')+'</option>'+
    Object.entries(moods).map(([id,label])=>'<option value="'+id+'">'+t(label)+'</option>').join('')+'</select></label></div>',()=>{});
  const mode=form.elements['draw-mode'];
  mode.onchange=()=>{
    const catalogue=mode.value==='catalogue';
    document.querySelector('#evening-constraints').hidden=catalogue;
    form.elements.minutes.disabled=catalogue;
  };
  form.onsubmit=event=>{
    event.preventDefault();
    const data=new FormData(form);
    dialog.close();
    const result=document.querySelector('#evening-results');
    if(!result)return;
    const ticket=++drawRequest;
    if(data.get('draw-mode')==='catalogue')renderCataloguePicks(result,data.get('platform'),ticket);
    else renderLibraryPicks(result,Number(data.get('minutes')),data.get('mood'),data.get('platform'));
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

function returnPanel(game,run) {
  const recent=run.sessions.at(-1);
  const pinned=game.tasks.map((task,index)=>({task,index})).filter(({task})=>task.pinned&&!task.done).slice(0,3);
  return '<section class="panel feature-panel"><div class="row"><h2>'+t('Co dalej?')+'</h2>'+
    btn(t('Edytuj kartę powrotu'),'edit-return')+'</div>'+
    '<div class="return-grid"><div><small>'+t('Gdzie skończyłem')+'</small><p>'+esc(run.resumeNote||recent?.note||t('Dodaj krótką notatkę o ostatniej sesji.'))+'</p></div>'+
    '<div><small>'+t('Następny cel')+'</small><p>'+esc(run.goal||t('Zapisz kolejny cel po sesji.'))+'</p></div></div>'+
    (pinned.length?'<div class="return-tasks">'+pinned.map(({task,index})=>goalRow(task,index,false)).join('')+'</div>':'')+
    '<div class="actions">'+btn(t('Profil krótkiej sesji'),'edit-hint')+'</div></section>';
}

function editReturn(game) {
  const run=game.runs[game.system];
  openForm(t('Karta powrotu'),
    '<label>'+t('Gdzie skończyłem')+'<textarea name="resume" rows="3" maxlength="1000">'+esc(run.resumeNote||run.sessions.at(-1)?.note||'')+'</textarea></label>'+
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
    const art=web(game.cover || '');
    const [cover,screenshot,brandMark]=await Promise.all([
      art?fetch(art,{signal:AbortSignal.timeout(6000)}).then(response=>response.blob()).then(cardBitmap).catch(()=>null):null,
      cardBitmap(shot?.blob),
      fetch('assets/checkpoint-icon-192.png',{signal:AbortSignal.timeout(3500)}).then(response=>response.ok?response.blob():null).then(cardBitmap).catch(()=>null),
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
