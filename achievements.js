// Imported achievements: Steam (through the shared Checkpoint server), Xbox (during Xbox sign-in)
// and Checkpoint Bridge files. They live inside a playthrough as run.sourceAchievements:
// { unlocked, total, gamerscore?, gamerscoreTotal?, list?: [...], syncedAt? }. All fields are optional.
const achievementListLimit=500;
const steamAchievementBatch=10;
const steamAchievementAutoGames=30;
let steamAchievementJob=null;
const achievementMessages=new Map();

function achievementIconUrl(value) {
  try{
    const url=new URL(value);
    const hosts=['steamstatic.com','akamaihd.net','steampowered.com','xboxlive.com','s-microsoft.com'];
    return url.protocol==='https:'&&hosts.some(host=>url.hostname===host||url.hostname.endsWith('.'+host))?url.href:'';
  }catch{return ''}
}

// Accepts rows from the server or a Bridge file and keeps only known, bounded fields.
function normalizeAchievementList(items) {
  if(!Array.isArray(items))return undefined;
  const text=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
  const rows=[];
  for(const item of items.slice(0,achievementListLimit)){
    const name=text(item?.name,200);
    if(!name)continue;
    const unlocked=item.unlocked===true;
    const row={id:text(item.id,128)||name,name,unlocked};
    const description=text(item.description,400);
    if(description)row.description=description;
    const at=typeof item.unlockedAt==='string'?Date.parse(item.unlockedAt):item.unlockedAt;
    if(unlocked&&Number.isFinite(at)&&at>0)row.unlockedAt=at;
    if(item.hidden===true)row.hidden=true;
    const icon=achievementIconUrl(item.icon);
    if(icon)row.icon=icon;
    if(Number.isInteger(item.gamerscore)&&item.gamerscore>=0&&item.gamerscore<=10000)row.gamerscore=item.gamerscore;
    rows.push(row);
  }
  return rows;
}

// Stores a full list on a playthrough and refreshes the summary from it.
function setAchievementList(target,list) {
  const unlocked=list.filter(item=>item.unlocked).length;
  target.sourceAchievements={...target.sourceAchievements,list,unlocked,total:list.length,syncedAt:Date.now()};
  const scored=list.filter(item=>Number.isInteger(item.gamerscore));
  if(scored.length){
    target.sourceAchievements.gamerscore=scored.filter(item=>item.unlocked).reduce((sum,item)=>sum+item.gamerscore,0);
    target.sourceAchievements.gamerscoreTotal=scored.reduce((sum,item)=>sum+item.gamerscore,0);
  }
}

// Saves the library; when the browser storage is full, keeps summaries and drops the longest lists.
function persistAchievements() {
  try{persist();return true}
  catch{
    const runs=games.flatMap(item=>Object.values(item.runs)).filter(item=>item.sourceAchievements?.list)
      .sort((a,b)=>b.sourceAchievements.list.length-a.sourceAchievements.list.length);
    for(const target of runs){
      delete target.sourceAchievements.list;
      try{persist();return false}catch{}
    }
    return false;
  }
}

async function loadSteamAchievements(appids) {
  if(!steamSessionValid())throw Object.assign(Error('login_required'),{code:'login_required'});
  const url=new URL('/api/steam/achievements',steamSession.server);
  url.searchParams.set('appids',appids.join(','));
  url.searchParams.set('lang',appLanguage());
  try{
    return await steamRequest(steamSession.server,url.pathname+url.search,{headers:{Authorization:'Bearer '+steamSession.token}});
  }catch(error){
    if(error.code==='login_required')forgetSteamSession();
    throw error;
  }
}

// Fetches Steam achievements for the given games, ten per request. Returns how many games got a list.
async function importSteamAchievements(list,onProgress=()=>{}) {
  const targets=list.filter(item=>Number.isInteger(item.steamAppId)&&item.steamAppId>0&&item.runs.Steam);
  let updated=0;
  let done=0;
  for(let index=0;index<targets.length;index+=steamAchievementBatch){
    const batch=targets.slice(index,index+steamAchievementBatch);
    const data=await loadSteamAchievements(batch.map(item=>item.steamAppId));
    for(const result of Array.isArray(data?.games)?data.games:[]){
      const item=batch.find(entry=>entry.steamAppId===result?.appid);
      const rows=normalizeAchievementList(result?.achievements);
      if(!item||!rows)continue;
      if(rows.length){setAchievementList(item.runs.Steam,rows);updated++}
      else item.runs.Steam.sourceAchievements={...item.runs.Steam.sourceAchievements,list:[],unlocked:0,total:0,syncedAt:Date.now()};
    }
    done+=batch.length;
    onProgress(done,targets.length);
  }
  persistAchievements();
  return updated;
}

// After a Steam import: achievements for the most played games, in the background.
function importSteamAchievementsAfterSync(list) {
  if(steamAchievementJob||!steamSessionValid())return;
  const played=list.filter(item=>(item.runs.Steam?.importedMinutes||0)>0)
    .sort((a,b)=>(b.runs.Steam.importedMinutes||0)-(a.runs.Steam.importedMinutes||0)).slice(0,steamAchievementAutoGames);
  if(!played.length)return;
  const base=steamMessage;
  steamAchievementJob=importSteamAchievements(played,(done,total)=>{
    steamMessage=base+' · '+t('Pobieram osiągnięcia…')+' '+done+' / '+total;
    if(location.hash==='#connections')render();
  }).then(count=>{
    steamMessage=base+' · '+t('Osiągnięcia zaktualizowane')+' · '+count;
  }).catch(error=>{
    steamMessage=base+' · '+t(achievementErrorMessage(error.code));
  }).finally(()=>{
    steamAchievementJob=null;
    if(['#connections','#library','#now',''].includes(location.hash)||active())render();
  });
}

async function refreshGameAchievements(item) {
  if(steamAchievementJob||!item?.steamAppId)return;
  if(!steamSessionValid()){
    achievementMessages.set(item.id,t('Połącz Steam w zakładce Połączenia, aby pobrać osiągnięcia.'));
    render();
    return;
  }
  achievementMessages.set(item.id,t('Pobieram osiągnięcia…'));
  render();
  steamAchievementJob=importSteamAchievements([item]);
  try{
    const count=await steamAchievementJob;
    achievementMessages.set(item.id,count?'':t('Ta gra nie ma osiągnięć Steam.'));
  }catch(error){achievementMessages.set(item.id,t(achievementErrorMessage(error.code)))}
  finally{steamAchievementJob=null;if(active()===item)render()}
}

function achievementErrorMessage(code) {
  return ({
    achievements_private:'Steam nie udostępnia osiągnięć. Ustaw „Szczegóły gier” jako publiczne w ustawieniach prywatności Steam.',
    login_required:'Połącz Steam w zakładce Połączenia, aby pobrać osiągnięcia.',
    rate_limited:'Zbyt wiele prób. Odczekaj kilka minut i spróbuj ponownie.',
  })[code]||'Nie udało się pobrać osiągnięć.';
}

function achievementDate(value) {
  return new Date(value).toLocaleDateString(appLocale(),{day:'numeric',month:'short',year:'numeric'});
}

function achievementsPanel(item,target) {
  const data=target.sourceAchievements;
  const steam=item.system==='Steam'&&Number.isInteger(item.steamAppId);
  const message=achievementMessages.get(item.id)||'';
  const refresh=steam?btn(t(data?.list?'Odśwież osiągnięcia':'Pobierz osiągnięcia'),'steam-achievements'):'';
  if(!data||(data.unlocked===undefined&&data.total===undefined&&data.gamerscore===undefined)){
    return steam?'<div class="achievements"><div class="row"><h3>'+t('Osiągnięcia')+'</h3>'+refresh+'</div>'+
      '<p class="muted" role="status">'+esc(message)+'</p></div>':'';
  }
  const number=new Intl.NumberFormat(appLocale());
  const percent=data.total>0?Math.round(Math.min(data.unlocked||0,data.total)/data.total*100):0;
  const summary=(data.unlocked??'—')+' / '+(data.total??'—')+(data.total>0?' · '+percent+'%':'');
  const list=Array.isArray(data.list)?data.list.slice().sort((a,b)=>
    Number(b.unlocked)-Number(a.unlocked)||(b.unlockedAt||0)-(a.unlockedAt||0)):[];
  const rows=list.map(entry=>'<li class="achievement'+(entry.unlocked?' unlocked':'')+'">'+
    (achievementIconUrl(entry.icon)?'<img loading="lazy" alt="" src="'+esc(entry.icon)+'">':'<span class="achievement-icon" aria-hidden="true">🏆</span>')+
    '<span><strong>'+esc(entry.name)+'</strong>'+
    '<small>'+esc(entry.description||(entry.hidden?t('Ukryte osiągnięcie'):''))+'</small>'+
    '<small class="achievement-state">'+esc(entry.unlocked?t('Odblokowane')+(entry.unlockedAt?' · '+achievementDate(entry.unlockedAt):''):t('Zablokowane'))+
    (Number.isInteger(entry.gamerscore)?' · '+entry.gamerscore+' G':'')+'</small></span></li>').join('');
  return '<div class="achievements"><div class="row"><h3>'+t('Osiągnięcia')+'</h3><strong>'+esc(summary)+'</strong></div>'+
    (data.total>0?bar(percent):'')+
    (data.gamerscore!==undefined?'<p class="muted">Gamerscore · '+number.format(data.gamerscore)+
      (data.gamerscoreTotal===undefined?'':' / '+number.format(data.gamerscoreTotal))+'</p>':'')+
    (rows?'<details class="achievement-details"><summary>'+t('Lista osiągnięć')+' ('+list.length+')</summary><ul class="achievement-list">'+rows+'</ul></details>':'')+
    (data.syncedAt?'<p class="muted">'+t('Zaktualizowano')+' · '+esc(achievementDate(data.syncedAt))+'</p>':'')+
    (refresh?'<div class="actions">'+refresh+'</div>':'')+
    '<p class="muted" role="status">'+esc(message)+'</p></div>';
}
