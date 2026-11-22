const coverTitleAliases = {
  'gta 5':'grand theft auto v',
  'gta v':'grand theft auto v',
  'gta 6':'grand theft auto vi',
  'gta vi':'grand theft auto vi',
  'wiedzmin 3':'the witcher 3 wild hunt',
  'wiedzmin 3 dziki gon':'the witcher 3 wild hunt',
  'cs2':'counter strike 2',
};

function coverTitle(title) {
  const normalized=catalogText(title.replaceAll('ł','l').replaceAll('Ł','L'));
  return coverTitleAliases[normalized]||normalized;
}

function usableCover(url,signal) {
  if(!url||signal.aborted)return Promise.resolve(false);
  return new Promise(resolve=>{
    const image=new Image();
    const finish=valid=>{
      clearTimeout(timeout);
      signal.removeEventListener('abort',cancel);
      image.onload=image.onerror=null;
      if(!valid)image.removeAttribute('src');
      resolve(valid);
    };
    const cancel=()=>finish(false);
    const timeout=setTimeout(cancel,6500);
    signal.addEventListener('abort',cancel,{once:true});
    image.onload=()=>finish(image.naturalWidth>=280&&image.naturalHeight>=150);
    image.onerror=cancel;
    image.src=url;
  });
}

async function resolveGameCover(entry,signal,validate) {
  const title=coverTitle(entry.title);
  const starter=starterGames.find(item=>coverTitle(item.title)===title);
  const steamId=entry.steamAppId;
  const preferred=starter?.cover || (starter?.artId?cdn(starter.artId):'');
  const artworkFallback=starter?.artId?steamHeader(starter.artId):'';
  const localChoices=[preferred,steamId?cdn(steamId):'',artworkFallback,steamId?steamHeader(steamId):''];
  const checked=new Set();
  async function tryChoices(candidates) {
    const urls=[...new Set(candidates.map(web).filter(Boolean))].filter(url=>!checked.has(url));
    for(const url of urls){
      checked.add(url);
      if(signal.aborted)return null;
      if(await validate(url))return {cover:url,coverFallback:urls.find(candidate=>candidate!==url&&candidate!==web(entry.cover))||''};
    }
    return null;
  }

  const known=await tryChoices(localChoices);
  if(known||signal.aborted)return known;

  const query=starter?.title||entry.title;
  const platforms=[...new Set([entry.system,...Object.keys(entry.runs),'Steam'])];
  for(const platform of platforms){
    if(signal.aborted)return null;
    if(!Object.hasOwn(storeCatalogs,platform))continue;
    try {
      const matches=await findCatalogGames(query,platform,true);
      for(const match of matches){
        const urls=match.steamId?[cdn(match.steamId),match.cover,steamHeader(match.steamId)]:[match.cover];
        const found=await tryChoices(urls);
        if(found)return found;
      }
    } catch {
      // Try the next catalogue if this one is unavailable.
    }
  }
  return null;
}

function openCoverRefresh(entries,allGames=false) {
  if(!entries.length)return;
  const statusMarkup='<p id="cover-refresh-status" role="status"></p>';
  openForm(t(allGames?'Odśwież wszystkie okładki':'Odśwież okładkę'),
    '<p>'+esc(allGames?t('Sprawdź okładki w całej bibliotece.'):entries[0].title)+'</p>'+
    '<progress id="cover-refresh-progress" max="'+entries.length+'" value="0" hidden></progress>'+statusMarkup,()=>{});
  const status=fields.querySelector('#cover-refresh-status');
  const progress=fields.querySelector('#cover-refresh-progress');
  const button=document.querySelector('#save');
  button.textContent=t('Odśwież');
  const controller=new AbortController();
  const {signal}=controller;
  dialog.addEventListener('close',()=>controller.abort(),{once:true});

  form.onsubmit=async event=>{
    event.preventDefault();
    if(button.disabled)return;
    button.disabled=true;
    progress.hidden=false;
    status.textContent=t('Szukam okładek…');
    const results=[];
    const images=new Map();
    const validate=url=>{
      if(!images.has(url))images.set(url,usableCover(url,signal));
      return images.get(url);
    };
    let index=0;
    async function scan() {
      while(!signal.aborted&&dialog.open&&status.isConnected&&index<entries.length){
        const entry=entries[index++];
        const title=entry.title;
        const artwork=await resolveGameCover(entry,signal,validate);
        if(artwork)results.push({entry,title,artwork});
        progress.value++;
      }
    }

    await Promise.all(Array.from({length:Math.min(4,entries.length)},scan));
    if(signal.aborted||!dialog.open||!status.isConnected)return;
    const changes=results.filter(({entry,title,artwork})=>games.includes(entry)&&entry.title===title&&entry.cover!==artwork.cover);
    const previous=changes.map(({entry})=>({entry,cover:entry.cover,coverFallback:entry.coverFallback}));
    try {
      for(const {entry,artwork} of changes)Object.assign(entry,artwork);
      if(changes.length)persist();
    } catch {
      for(const {entry,...artwork} of previous)Object.assign(entry,artwork);
      status.textContent=t('Nie udało się zapisać okładek.');
      button.disabled=false;
      return;
    }

    if(changes.length){
      if(location.hash==='#library')renderLibraryResults();
      else render();
    }
    status.textContent=t('Zmienione okładki')+' · '+changes.length+' / '+entries.length;
    button.hidden=true;
  };
}
