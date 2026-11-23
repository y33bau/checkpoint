const librarySources = {
  xbox: { name:'Xbox', platform:'Xbox', path:'/xbox' },
  ps: { name:'PlayStation', platform:'PlayStation', path:'/ps' },
  wand: { name:'Wand', platform:'PC' },
};
const localBridge = 'http://127.0.0.1:43179';
const sourceKeys = new Map();
const sourceMessages = new Map();
const sourceJobs = new Set();
const sourceGuide = 'https://github.com/y33bau/checkpoint/tree/main/integrations/consoles';

function sourceConnectionButtons(provider,saved) {
  const input=btn(t(provider==='wand'?'Wklej listę gier':'Importuj plik'),'source-file:'+provider);
  const view=btn(t('Pokaż zaimportowane gry'),'source-view:'+provider);
  if(provider==='wand')return view;
  if(provider==='ps')return input+view+
    btn(t(saved?.libraryUrl?'Ustawienia połączenia':'Podłącz przez Bridge'),'source-connect:ps')+
    (saved?.libraryUrl?btn(t('Synchronizuj bibliotekę'),'source-sync:ps'):'');
  return input+view+btn(t(saved?.libraryUrl?'Ustawienia połączenia':'Podłącz bibliotekę'),'source-connect:'+provider)+
    (saved?.libraryUrl?btn(t('Synchronizuj bibliotekę'),'source-sync:'+provider):'');
}

function sourceConnectionDetails(provider,saved) {
  if(provider==='wand')return '<small>'+t('Zaimportuj skopiowaną listę i publiczne linki do map Wand.')+'</small>'+
    sourceStatus(provider);
  const last=saved?.librarySyncedAt&&!saved?.lastImport?new Date(saved.librarySyncedAt).toLocaleString(appLocale()):'';
  return '<small>'+t(provider==='xbox'?'Historia grania i podsumowanie osiągnięć.':'Zakupy i uprawnienia PS4 / PS5 oraz historia grania.')+'</small>'+
    (last?'<small>'+t('Ostatnia synchronizacja')+' · '+esc(last)+'</small>':'')+
    '<a class="text-link" href="'+sourceGuide+'" target="_blank" rel="noopener noreferrer">'+t('Konfiguracja połączenia')+'</a>'+
    (provider==='ps'?'':sourceStatus(provider));
}

function sourceStatus(provider) {
  const message=sourceMessages.get(provider);
  return '<p id="source-status-'+provider+'" role="status">'+(message?esc(message):'')+'</p>';
}

function setSourceStatus(provider,message) {
  sourceMessages.set(provider,message);
  const status=document.querySelector('#source-status-'+provider);
  if(status)status.textContent=message;
}

function sourceURL(raw) {
  const parsed=new URL(raw);
  if(parsed.username||parsed.password||parsed.hash)throw Error(t('Podaj prawidłowy adres połączenia.'));
  if(parsed.protocol==='https:' || (parsed.protocol==='http:' && parsed.host==='127.0.0.1:43179'))return parsed.href;
  throw Error(t('Podaj HTTPS lub adres lokalnego programu.'));
}

function normalizeSourceRows(data,provider) {
  if(data?.format!=='checkpoint-source-v1'||data.provider!==provider||!Array.isArray(data.games)||data.games.length>5000)
    throw Error(t('Plik lub źródło ma nieprawidłowy format.'));
  const safeInteger=(value,max)=>Number.isInteger(value)&&value>=0&&value<=max?value:undefined;
  return data.games.map(item=>{
    if(typeof item?.title!=='string'||!item.title.trim())return null;
    return {
      title:item.title.trim().slice(0,180),
      id:typeof item.id==='string'?item.id.slice(0,150):'',
      cover:web(item.cover||''),
      minutes:safeInteger(item.minutes,10000000),
      lastPlayed:typeof item.lastPlayed==='string'?Date.parse(item.lastPlayed):NaN,
      unlocked:safeInteger(item.unlocked,10000),
      total:safeInteger(item.total,10000),
      gamerscore:safeInteger(item.gamerscore,10000000),
      gamerscoreTotal:safeInteger(item.gamerscoreTotal,10000000),
      activity:['played','entitled'].includes(item.activity)?item.activity:undefined,
      achievements:provider==='wand'?undefined:normalizeAchievementList(item.achievements),
      map:provider==='wand'?wandMap(item.map):'',
    };
  }).filter(Boolean);
}

function wandMap(value) {
  try {
    const url=new URL(value);
    return url.protocol==='https:' && (url.hostname==='wand.com'||url.hostname.endsWith('.wand.com'))?url.href:'';
  }catch{return ''}
}

function parseWandList(text) {
  return text.split(/\r?\n/).filter(line=>line.trim()).map(line=>{
    const [title,map]=line.trim().split(/\s*(?:\t|\|)\s*/,2);
    return {title:title.replace(/^[-•]\s*/,''),map};
  });
}

function mergeNormalizedSource(rows,provider,save=persistAchievements) {
  const source=librarySources[provider];
  const byTitle=new Map(games.map(item=>[catalogText(item.title),item]));
  const byId=new Map(games.filter(item=>item.sourceIds?.[provider]).map(item=>[item.sourceIds[provider],item]));
  const touched=new Set();
  let added=0;
  for(const row of rows){
    const title=catalogText(row.title);
    let entry=(row.id&&byId.get(row.id))||byTitle.get(title);
    if(!entry){
      entry=game(row.title,source.platform,row.cover,source.name);
      games.push(entry);
      added++;
    }
    entry.importSources={...entry.importSources,[provider]:true};
    byTitle.set(title,entry);
    if(row.id){
      entry.sourceIds={...entry.sourceIds,[provider]:row.id};
      byId.set(row.id,entry);
    }
    if(provider!=='wand'||!Object.keys(entry.runs).length)entry.runs[source.platform]??=run();
    const target=entry.runs[source.platform];
    if(provider!=='wand' && target){
      if(row.minutes!==undefined)target.importedMinutes=row.minutes;
      if(Number.isFinite(row.lastPlayed))target.importedPlayedAt=row.lastPlayed;
      if(row.unlocked!==undefined||row.total!==undefined||row.gamerscore!==undefined||row.gamerscoreTotal!==undefined){
        target.sourceAchievements={...target.sourceAchievements,...Object.fromEntries([
          ['unlocked',row.unlocked],['total',row.total],['gamerscore',row.gamerscore],['gamerscoreTotal',row.gamerscoreTotal],
        ].filter(([,value])=>value!==undefined))};
      }
      if(row.achievements?.length)setAchievementList(target,row.achievements);
      if(row.activity)target.sourceActivity=row.activity;
    }
    if(!entry.cover && row.cover)entry.cover=row.cover;
    if(row.map && !entry.maps.some(map=>map.url===row.map))entry.maps.push({name:'Wand',url:row.map});
    touched.add(entry);
  }
  save();
  attachCriticScores([...touched]);
  return {added,count:touched.size};
}

function importMessage(data,result) {
  const summary=t('Gry wczytane')+' · '+result.count+' · '+t('Nowe gry')+' · '+result.added;
  return summary+(data.partial?' · '+t('Źródło zwróciło część danych.'):'');
}

function openLibraryFile(provider) {
  const name=librarySources[provider].name;
  const wand=provider==='wand';
  const hint=wand?'Wpisz jeden tytuł w każdym wierszu. Po znaku | możesz podać publiczny link do mapy Wand.':
    'Wybierz plik JSON wyeksportowany przez Checkpoint Bridge.';
  openForm(t(wand?'Wklej listę gier':'Importuj plik')+' · '+name,
    '<p class="muted">'+t(hint)+'</p>'+
    (wand?'<label>'+t('Lista gier')+'<textarea name="titles" rows="6" maxlength="120000" required></textarea></label>':
      '<label>'+t('Plik biblioteki')+'<input name="library-file" type="file" accept=".json,application/json" required></label>')+
    '<p id="source-file-status" role="status"></p>',()=>{});
  form.onsubmit=async event=>{
    event.preventDefault();
    const data=new FormData(form);
    const field=document.querySelector('#source-file-status');
    const save=document.querySelector('#save');
    save.disabled=true;
    try{
      let exported;
      if(wand)exported={format:'checkpoint-source-v1',provider,games:parseWandList(data.get('titles'))};
      else {
        const file=data.get('library-file');
        if(!file?.size||file.size>6*1024*1024)throw Error(t('Wybierz plik do 6 MB.'));
        exported=JSON.parse(await file.text());
      }
      if(!dialog.open || document.querySelector('#source-file-status')!==field)return;
      normalizeSourceRows(exported,provider);
      dialog.close();
      previewConsole(exported,provider,wand?'list':'file');
    }catch{field.textContent=t('Nie udało się wczytać listy. Sprawdź format danych.')}
    finally{save.disabled=false}
  };
}

async function syncLibrarySource(provider) {
  if(sourceJobs.has(provider)||deviceBusy)return;
  const saved=connections[provider];
  const key=sourceKeys.get(provider);
  if(!saved?.libraryUrl || !key){consoleConnectionStep(provider,true);return}
  sourceJobs.add(provider);
  setSourceStatus(provider,t('Pobieram bibliotekę…'));
  try {
    const url=sourceURL(saved.libraryUrl);
    const response=await fetch(url,{
      headers:{Authorization:'Bearer '+key},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(50000),
    });
    if(response.status===401)throw Error(t('Klucz Checkpoint Bridge jest nieprawidłowy.'));
    if(response.status===502)throw Error(t('Bridge odpowiada, ale dostawca konta nie zwrócił biblioteki.'));
    if(!response.ok)throw Error(t('Bridge odrzucił połączenie.'));
    const data=await response.json();
    if(deviceBusy||connections[provider]!==saved)return;
    setSourceStatus(provider,'');
    previewConsole(data,provider,'sync');
  }catch(error){setSourceStatus(provider,error.name==='TypeError'||error.name==='TimeoutError'?t('Bridge nie odpowiada. Sprawdź program i zgodę przeglądarki.'):error.message)}
  finally{sourceJobs.delete(provider)}
}

function activityPanel(run) {
  if(!run.sourceActivity)return '';
  const lines=[];
  if(run.sourceActivity==='entitled')lines.push(t('Z biblioteki PlayStation'));
  if(run.sourceActivity==='played')lines.push(t('Z historii grania'));
  return '<div class="source-activity">'+lines.map(line=>'<p>'+esc(line)+'</p>').join('')+'</div>';
}

function xboxAchievementsButton(game) {
  if(game.system!=='Xbox'||!/^\d{1,12}$/.test(game.sourceIds?.xbox)||!connections.xbox?.libraryUrl)return '';
  return '<div class="actions">'+btn(t('Pokaż osiągnięcia'),'xbox-achievements')+'</div>'+
    '<div id="xbox-achievements-list" aria-live="polite"></div>';
}

async function showXboxAchievements(game) {
  const panel=document.querySelector('#xbox-achievements-list');
  const saved=connections.xbox;
  const key=sourceKeys.get('xbox');
  if(!panel || !saved?.libraryUrl || !/^\d{1,12}$/.test(game.sourceIds?.xbox))return;
  if(!key){consoleConnectionStep('xbox',false);return}
  panel.textContent=t('Pobieram osiągnięcia…');
  try{
    const url=new URL(sourceURL(saved.libraryUrl));
    url.pathname=url.pathname.replace(/\/$/,'')+'/achievements/'+game.sourceIds.xbox;
    const response=await fetch(url,{headers:{Authorization:'Bearer '+key},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error('Unavailable');
    const data=await response.json();
    if(!Array.isArray(data.achievements))throw Error('Unavailable');
    if(document.querySelector('#xbox-achievements-list')!==panel)return;
    const rows=data.achievements.filter(item=>typeof item?.name==='string').sort((a,b)=>Number(Boolean(b.unlocked))-Number(Boolean(a.unlocked)));
    panel.innerHTML=rows.length?'<ul class="session-log">'+rows.map(item=>'<li><strong>'+esc(item.name)+'</strong><p>'+
      t(item.unlocked?'Odblokowane':'Zablokowane')+(item.description?' · '+esc(item.description):'')+'</p></li>').join('')+'</ul>':
      '<p class="muted">'+t('Brak dostępnych osiągnięć.')+'</p>';
  }catch{panel.textContent=t('Nie udało się pobrać osiągnięć.')}
}
