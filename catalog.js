const storeCatalogs = {
  Xbox: 'xbox-console',
  Steam: 'steam',
  PlayStation: 'psn',
  Nintendo: 'nintendo',
};
const catalogBase = 'https://raw.githubusercontent.com/Ephellon/game-store-catalog/main/';
const catalogCache = new Map();

function catalogText(value) {
  return value.normalize('NFKD').toLowerCase()
    .replace(/[\u0300-\u036f™®©]/g,'')
    .replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}

function catalogBucket(store, letter) {
  const path = storeCatalogs[store]+'/'+letter+'.json';
  if (!catalogCache.has(path)) {
    const request = fetch(catalogBase+path,{signal:AbortSignal.timeout(7000)})
      .then(response=>{
        if (!response.ok) throw Error('Game catalogue unavailable');
        return response.json();
      })
      .catch(error=>{
        if (catalogCache.get(path) === request) catalogCache.delete(path);
        throw error;
      });
    catalogCache.set(path,request);
    if (catalogCache.size > 12) catalogCache.delete(catalogCache.keys().next().value);
  }
  return catalogCache.get(path);
}

function catalogEntry(entry,store) {
  if(typeof entry?.name!=='string'||(entry.type&&String(entry.type).toLowerCase()!=='game'))return null;
  return {
    title:entry.name,store,
    steamId:store==='Steam'&&/^\d+$/.test(entry.uuid)?Number(entry.uuid):null,
    cover:web(entry.image||''),
    versions:Array.isArray(entry.platforms)?entry.platforms.filter(value=>typeof value==='string'):[],
  };
}

// Genre gives a rough session length when the catalogue has no individual play-time profile.
const catalogueSessionMinutes = {
  'Logiczne':30,'Wyścigi':30,'Zręcznościowe':30,'Platformówki':30,'Muzyczne':30,
  'Bijatyki':30,'Karcianki i planszowe':30,'Imprezowe':30,'Sportowe':30,
  'Akcja':60,'Strzelanki':60,'Roguelike':60,'Przygodowe':60,
  'RPG':120,'Survival':120,'Sandbox':120,
  'Strategie':180,'Symulacje':180,
};

function catalogueSessionBonus(minutes,typicalMinutes) {
  if(!minutes)return 0;
  if(!typicalMinutes)return -3;
  const ratio=minutes/typicalMinutes;
  return ratio===1?16:ratio>=1?Math.max(0,8/ratio):ratio>=.5?-7:-16;
}

function rankedCatalogueGames({steam,critics,genres},platform,genre,order,{limit=60,minutes=null,exclude}={}) {
  const stores={
    Steam:['PC'],Xbox:['Xbox Series X','Xbox One'],
    PlayStation:['PlayStation 5','PlayStation 4'],Nintendo:['Nintendo Switch 2','Nintendo Switch'],
  };
  const desired=platform==='PC'?'Steam':platform;
  const choices=new Map();

  function add(title,store,version,critic,review) {
    const key=catalogText(title);
    if(!key||exclude?.(key,review?.id))return;
    const byPlatform=genres?.get(key);
    const indexedGenre=byPlatform?.get(version)||
      (byPlatform?.size===1?byPlatform.values().next().value:'');
    if(genre&&indexedGenre!==genre)return;
    const rating=rankEveningHit(order,critic,review);
    if(!rating)return;
    const sessionMinutes=Object.hasOwn(catalogueSessionMinutes,indexedGenre)?catalogueSessionMinutes[indexedGenre]:null;
    const rank=rating.value+catalogueSessionBonus(minutes,sessionMinutes);
    const current=choices.get(key);
    if(current&&(current.rank>rank||(current.rank===rank&&compareEveningRatings(rating,current.rating)>=0)))return;
    choices.set(key,{title,store,versions:version?[version]:[],genre:indexedGenre,rating,rank,sessionMinutes,
      steamId:store==='Steam'?review?.id:undefined,artId:review?.id,cover:review?.id?cdn(review.id):''});
  }

  for(const [key,versions] of critics||[]){
    const review=steam?.byTitle.get(key);
    for(const [store,supported] of Object.entries(stores)){
      if(desired&&store!==desired)continue;
      if(platform==='Steam'&&store==='Steam'&&!review)continue;
      for(const version of supported){
        const entry=versions.get(version);
        if(!entry)continue;
        add(entry.title,store==='Steam'&&!review?'PC':store,version,entry.critics,review);
      }
    }
  }
  if(!desired||desired==='Steam'){
    for(const review of steam?.byTitle.values()||[]){
      if(!review||review.reviews<5000||review.value<.90)continue;
      const critic=critics?.get(catalogText(review.title))?.get('PC')?.critics;
      add(review.title,'Steam','PC',critic,review);
    }
  }
  return [...choices.values()].sort((a,b)=>b.rank-a.rank||compareEveningRatings(a.rating,b.rating)||
    a.title.localeCompare(b.title)).slice(0,limit);
}

async function findCatalogGames(title, store, exact=false) {
  const query = catalogText(title);
  if (query.length < 2 || !Object.hasOwn(storeCatalogs,store)) return [];
  const first = /^[a-z]/.test(query) ? query[0] : '_';
  const buckets = first==='t' ? [first] : [first,'t'];
  for (const letter of buckets) {
    const games = await catalogBucket(store,letter);
    const matches = [];
    for (const entry of games) {
      const choice=catalogEntry(entry,store);
      if(!choice)continue;
      const name = catalogText(entry.name);
      const clean = name.replace(/^the /,'');
      let rank = name===query ? 0 : clean===query ? 1 : clean.startsWith(query) ? 2 : clean.includes(' '+query) ? 3 : 4;
      if (rank > (exact ? 0 : 3)) continue;
      if (!choice.cover && !choice.steamId) rank += 4;
      matches.push({...choice,rank});
    }
    const unique = new Map();
    for (const match of matches.sort((a,b)=>a.rank-b.rank||a.title.length-b.title.length)) {
      const key = catalogText(match.title);
      if (!unique.has(key)) unique.set(key,match);
      if (unique.size===7) break;
    }
    if (unique.size) return [...unique.values()];
  }
  return [];
}

async function catalogSuggestions(title, store) {
  const primary = await findCatalogGames(title,store);
  if (primary.length) return primary;
  const otherStores = Object.keys(storeCatalogs).filter(candidate=>candidate!==store);
  const lookups = await Promise.allSettled(otherStores.map(candidate=>findCatalogGames(title,candidate)));
  return lookups.flatMap(lookup=>lookup.status==='fulfilled' ? lookup.value : [])
    .sort((a,b)=>a.rank-b.rank||a.title.length-b.title.length).slice(0,7);
}

function useCatalogCover(game, choice) {
  game.catalogVersions={...game.catalogVersions,[choice.store]:choice.versions||[]};
  if (choice.steamId) {
    game.steamAppId = choice.steamId;
    game.cover = cdn(choice.steamId);
    game.coverFallback = choice.cover || steamHeader(choice.steamId);
  } else if (choice.cover) {
    game.cover = choice.cover;
    game.coverFallback = '';
  }
}

function wireCatalogSearch(initialTitle,initialChoice) {
  const title = form.elements.title;
  const platform = form.elements.system;
  const results = document.querySelector('#catalog-results');
  const status = document.querySelector('#catalog-status');
  let timer, revision=0, selectedIndex=-1, items=[], selected=initialChoice||null;
  title.setAttribute('autocomplete','off');
  title.setAttribute('role','combobox');
  title.setAttribute('aria-autocomplete','list');
  title.setAttribute('aria-controls',results.id);
  title.setAttribute('aria-expanded','false');

  function clearResults() {
    selectedIndex=-1;
    items=[];
    results.replaceChildren();
    results.hidden=true;
    status.textContent='';
    title.setAttribute('aria-expanded','false');
    title.removeAttribute('aria-activedescendant');
  }

  function select(item) {
    revision++;
    clearResults();
    title.value=item.title;
    platform.value=item.store;
    selected=item;
    title.focus();
  }

  async function search(ticket, query, store) {
    if (ticket!==revision || !dialog.open) return;
    status.textContent=t('Szukam w katalogu…');
    try {
      const next = await catalogSuggestions(query,store);
      if (ticket!==revision || !dialog.open) return;
      items=next;
      status.textContent=items.length ? '' : t('Brak podpowiedzi. Możesz dodać grę ręcznie.');
      if (!items.length) return;
      results.hidden=false;
      title.setAttribute('aria-expanded','true');
      items.forEach((item,index)=>{
        const option=document.createElement('div');
        option.className='catalog-option';
        option.id='catalog-option-'+index;
        option.setAttribute('role','option');
        option.setAttribute('aria-selected','false');
        if (item.cover) {
          const image=document.createElement('img');
          image.src=item.cover;
          image.alt='';
          image.addEventListener('error',()=>image.remove());
          option.append(image);
        }
        const label=document.createElement('span');
        label.textContent=item.title;
        option.append(label);
        if (item.store!==store) {
          const badge=document.createElement('small');
          badge.textContent=item.store;
          option.append(badge);
        }
        option.addEventListener('mousedown',event=>event.preventDefault());
        option.addEventListener('click',()=>select(item));
        results.append(option);
      });
    } catch {
      if (ticket===revision && dialog.open) status.textContent=t('Katalog chwilowo niedostępny. Możesz dodać grę ręcznie.');
    }
  }

  function schedule() {
    clearTimeout(timer);
    const ticket=++revision;
    selected=null;
    clearResults();
    if (catalogText(title.value).length>=2) timer=setTimeout(()=>search(ticket,title.value,platform.value),260);
  }

  title.addEventListener('input',schedule);
  platform.addEventListener('change',()=>{
    if (title.value !== initialTitle || !initialTitle) schedule();
    else {
      revision++;
      selected=null;
      clearResults();
    }
  });
  title.addEventListener('keydown',event=>{
    if (event.key==='Escape' && (!results.hidden || status.textContent)) {
      event.preventDefault();
      revision++;
      clearResults();
      return;
    }
    if (!items.length) return;
    if (event.key==='Enter' && selectedIndex>=0) {
      event.preventDefault();
      select(items[selectedIndex]);
      return;
    }
    if (!['ArrowDown','ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    const step=event.key==='ArrowDown' ? 1 : -1;
    selectedIndex=selectedIndex<0 && step<0 ? items.length-1 : (selectedIndex+step+items.length)%items.length;
    [...results.children].forEach((option,index)=>option.setAttribute('aria-selected',String(index===selectedIndex)));
    const option=results.children[selectedIndex];
    title.setAttribute('aria-activedescendant',option.id);
    option.scrollIntoView({block:'nearest'});
  });
  return () => selected;
}
