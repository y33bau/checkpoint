const criticSnapshot = 'https://raw.githubusercontent.com/StadynR/metacritic-reviews-dataset/main/metacritic_dataset_raw.csv';
const criticProject = 'https://github.com/StadynR/metacritic-reviews-dataset';
const criticPlatforms = {
  Xbox:['Xbox Series X','Xbox One','Xbox 360','Xbox'],
  Steam:['PC'],
  PlayStation:['PlayStation 5','PlayStation 4','PlayStation 3','PlayStation 2','PlayStation'],
  Nintendo:['Nintendo Switch 2','Nintendo Switch','Wii U','Wii','GameCube','Nintendo 64','3DS','DS','Game Boy Advance'],
};
let criticIndexPromise;

function parseCriticSnapshot(csv) {
  const index=new Map();
  // Relevant fields precede the free-text columns. The title may be quoted and contain commas.
  const fields=/^("(?:[^"]|"")*"|[^",]*),([^,]*),[^,]*,([^,]*),([^,]*),/;
  for(const line of csv.split(/\r?\n/).slice(1)){
    const match=fields.exec(line);
    if(!match)continue;
    const [,rawTitle,platform,rawCritics,rawUsers]=match;
    const title=rawTitle.replace(/^"|"$/g,'').replaceAll('""','"');
    const clean=catalogText(title);
    if(!clean)continue;
    const critics=/^\d{1,3}$/.test(rawCritics) && +rawCritics>=0 && +rawCritics<=100 ? +rawCritics : null;
    const users=/^\d+(?:\.\d+)?$/.test(rawUsers) && +rawUsers>=0 && +rawUsers<=10 ? +rawUsers : null;
    if(critics===null && users===null)continue;
    if(!index.has(clean))index.set(clean,new Map());
    const versions=index.get(clean);
    if(!versions.has(platform))versions.set(platform,{critics,users,platform});
  }
  return index;
}

function criticIndex() {
  if(!criticIndexPromise){
    criticIndexPromise=fetch(criticSnapshot,{signal:AbortSignal.timeout(12000)}).then(response=>{
      if(!response.ok)throw Error('Metacritic snapshot unavailable');
      return response.text();
    }).then(parseCriticSnapshot).catch(error=>{criticIndexPromise=null;throw error});
  }
  return criticIndexPromise;
}

function matchCriticScore(index,title,system,storeVersions=[]) {
  const matches=index.get(catalogText(title));
  if(!matches)return null;
  const versions=criticPlatforms[system]||[];
  const hints=storeVersions.map(version=>catalogText(version));
  const preferred=versions.find(version=>hints.some(hint=>hint===catalogText(version)||'nintendo '+hint===catalogText(version)));
  if(preferred)return matches.get(preferred)||null;
  return versions.map(version=>matches.get(version)).find(Boolean)||null;
}

let criticJobs=new Set();
async function attachCriticScores(entries) {
  const candidates=[];
  for(const game of entries)for(const system of Object.keys(game.runs)){
    const token=game.id+'|'+system+'|'+game.title;
    if(game.criticScores?.[system] || criticJobs.has(token))continue;
    criticJobs.add(token);
    candidates.push({game,system,token,title:game.title});
  }
  if(!candidates.length)return;
  try {
    const index=await criticIndex();
    if(deviceBusy)return;
    let changed=false;
    for(const {game,system,title} of candidates){
      if(!games.includes(game)||game.title!==title||game.criticScores?.[system])continue;
      const match=matchCriticScore(index,title,system,game.catalogVersions?.[system]||[]);
      game.criticScores={...game.criticScores,[system]:match||{unavailable:true}};
      changed=true;
    }
    if(changed){
      try{persist()}catch{ /* Scores remain available in memory if the storage quota was exceeded. */ }
      if(candidates.some(item=>item.game===active())&&!dialog.open && currentGameTab==='ratings')render();
    }
  } catch {
    // The catalogue and manual entry stay usable while this source is unavailable.
  } finally {
    for(const candidate of candidates)criticJobs.delete(candidate.token);
  }
}

function criticScoresPanel(game) {
  const rating=game.criticScores?.[game.system];
  const number=new Intl.NumberFormat(appLocale(),{maximumFractionDigits:1});
  const format=(value,scale)=>typeof value==='number' && Number.isFinite(value)?number.format(value)+' / '+scale:'—';
  return '<section class="panel feature-panel"><div class="row"><h2>Metacritic</h2>'+
    '<a class="text-link" href="'+criticProject+'" target="_blank" rel="noopener noreferrer">'+t('Źródło wyników')+'</a></div>'+
    '<div class="start-metrics"><div><small>'+t('Krytycy')+'</small><strong>'+format(rating?.critics,100)+'</strong></div>'+
    '<div><small>'+t('Gracze')+'</small><strong>'+format(rating?.users,10)+'</strong></div></div>'+
    '<small>'+esc(rating?.platform||game.system)+' · '+t('Dane z migawki 7.10.2025')+'</small>'+
    (rating?.unavailable?'<p class="muted">'+t('Brak ocen dla tej wersji w migawce.')+'</p>':'')+
    (!rating?'<button data-act="critics-retry">'+t('Pobierz oceny')+'</button>':'')+'</section>';
}

function autoCriticValue(game) {
  const score=game.criticScores?.[game.system]?.critics;
  return Number.isInteger(score) && score>=1 && score<=100?score:undefined;
}

function criticValue(game,platform) {
  const manual=game.startRating?.metacritic?.[platform];
  const imported=game.criticScores?.[platform]?.critics;
  if(Number.isInteger(manual)&&manual>=1&&manual<=100)return manual;
  return Number.isInteger(imported)&&imported>=1&&imported<=100?imported:undefined;
}
