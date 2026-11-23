let igdbAvailability;
const igdbLookups=new Map();
let igdbQueue=Promise.resolve();
const observedIgdbTargets=new WeakSet();
const igdbObserver=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
  for(const entry of entries){
    if(!entry.isIntersecting)continue;
    igdbObserver.unobserve(entry.target);
    for(const target of entry.target.querySelectorAll(':scope > [data-igdb-kind]')){
      const image=entry.target.querySelector('img');
      if(target.dataset.igdbKind==='hero'&&image?.getAttribute('src')?.endsWith('/library_hero.jpg'))continue;
      if(target.dataset.igdbKind!=='cover'||!image)fillIgdbMetadata(target);
    }
  }
},{rootMargin:'180px'}):null;

function igdbTarget(game,kind){
  const system=game.system||game.store;
  if(!game.title||!system)return '';
  return '<span hidden data-igdb-kind="'+kind+'" data-title="'+esc(game.title)+'" data-system="'+esc(system)+
    '" data-steam-id="'+esc(game.steamAppId||game.steamId||game.artId||'')+'"></span>';
}

function observeIgdbMetadata(container=app){
  for(const marker of container.querySelectorAll('[data-igdb-kind]')){
    const host=marker.parentElement;
    if(observedIgdbTargets.has(host))continue;
    if(marker.dataset.igdbKind==='cover'&&host.querySelector('img'))continue;
    observedIgdbTargets.add(host);
    if(igdbObserver)igdbObserver.observe(host);
    else fillIgdbMetadata(marker);
  }
}

function igdbAvailable(server){
  if(!igdbAvailability){
    igdbAvailability=fetch(new URL('/api/igdb/status',server),{signal:AbortSignal.timeout(4500)})
      .then(response=>response.ok?response.json():null)
      .then(data=>{
        if(data?.ready) document.querySelector('#igdb-credit').hidden=false;
        return data?.ready===true;
      }).catch(()=>false);
  }
  return igdbAvailability;
}

async function igdbGame({title,system,steamId}){
  const server=steamServerAddress();
  if(!server||!(await igdbAvailable(server)))return null;
  const url=new URL('/api/igdb/game',server);
  url.search=new URLSearchParams({title,system,steamId});
  if(!igdbLookups.has(url.href)){
    const task=igdbQueue.then(async()=>{
      const response=await fetch(url,{signal:AbortSignal.timeout(13000)});
      if(!response.ok)throw Error('IGDB lookup unavailable');
      return (await response.json()).game;
    }).catch(()=>{igdbLookups.delete(url.href);return null});
    igdbLookups.set(url.href,task);
    igdbQueue=task.then(()=>new Promise(resolve=>setTimeout(resolve,300)));
  }
  return igdbLookups.get(url.href);
}

function igdbImage(value){
  if(typeof value!=='string')return '';
  return /^https:\/\/images\.igdb\.com\/igdb\/image\/upload\/t_[a-z0-9_]+\/[a-zA-Z0-9_]+\.jpg$/.test(value)?value:'';
}

async function fillIgdbMetadata(marker){
  if(!marker||marker.dataset.igdbRequested)return;
  marker.dataset.igdbRequested='yes';
  const data=await igdbGame(marker.dataset);
  if(!data||!marker.isConnected)return;
  const kind=marker.dataset.igdbKind;
  const host=marker.parentElement;
  if(kind==='scores'){
    const label=new Intl.NumberFormat(appLocale());
    const rows=[['Krytycy',data.critics],['Gracze',data.players]].filter(([,entry])=>
      Number.isFinite(entry?.value)&&Number.isSafeInteger(entry.count));
    if(!rows.length)return;
    const link=typeof data.slug==='string'&&/^[a-z0-9-]+$/.test(data.slug)?'https://www.igdb.com/games/'+data.slug:'https://www.igdb.com/';
    marker.outerHTML='<section class="panel feature-panel"><div class="row"><h2>IGDB</h2>'+
      '<a class="text-link" href="'+link+'" target="_blank" rel="noopener noreferrer">'+t('Źródło wyników')+'</a></div>'+
      '<div class="start-metrics">'+rows.map(([name,entry])=>'<div><small>'+t(name)+'</small><strong>'+
      label.format(entry.value)+' / 100</strong><small>'+label.format(entry.count)+' '+t('ocen')+'</small></div>').join('')+
      '</div></section>';
    return;
  }
  const src=igdbImage(kind==='hero'?data.hero:data.cover);
  if(!src)return;
  const existing=host.querySelector('img');
  if(kind==='cover'&&existing)return;
  const img=new Image();
  img.alt='';
  img.loading='lazy';
  if(kind==='hero'){
    img.className='feature-image';
    img.dataset.artNext=JSON.stringify(existing?[existing.getAttribute('src'),...JSON.parse(existing.dataset.artNext||'[]')]:[]);
  }
  if(existing)existing.replaceWith(img);
  else marker.before(img);
  img.src=src;
}
