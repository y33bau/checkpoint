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

async function drawCatalogueGames(platform,rate) {
  const stores=rate&&platform==='PC'?['Steam']:Object.hasOwn(storeCatalogs,platform)?[platform]:Object.keys(storeCatalogs);
  const letters='abcdefghijklmnopqrstuvwxyz_';
  const savedTitles=new Set(games.map(game=>catalogText(game.title)));
  const choices=new Map();
  if(rate)return drawRatedCatalogueGames(stores,letters,savedTitles,rate);
  for(let attempt=0;attempt<3&&choices.size<3;attempt++){
    const store=stores[Math.floor(Math.random()*stores.length)];
    const letter=letters[Math.floor(Math.random()*letters.length)];
    try {
      const pool=(await catalogBucket(store,letter)).map(item=>catalogEntry(item,store))
        .filter(item=>item && !savedTitles.has(catalogText(item.title)));
      while(pool.length&&choices.size<3){
        const slot=Math.floor(Math.random()*pool.length);
        const [item]=pool.splice(slot,1);
        choices.set(catalogText(item.title),item);
      }
    }catch{continue}
  }
  return [...choices.values()];
}

async function drawRatedCatalogueGames(stores,letters,savedTitles,rate) {
  const requests=stores.flatMap(store=>{
    const available=[...letters];
    return Array.from({length:2},()=>{
      const [letter]=available.splice(Math.floor(Math.random()*available.length),1);
      return catalogBucket(store,letter).then(entries=>({entries,store}));
    });
  });
  const batches=(await Promise.allSettled(requests)).filter(batch=>batch.status==='fulfilled');
  if(!batches.length)throw Error('Game catalogue unavailable');
  const choices=new Map();
  for(const {value:{entries,store}} of batches){
    for(const entry of entries){
      const item=catalogEntry(entry,store);
      if(!item)continue;
      const title=catalogText(item.title);
      if(savedTitles.has(title))continue;
      const rating=rate(item,store);
      if(!rating)continue;
      const previous=choices.get(title);
      if(!previous||compareEveningRatings(rating,previous.rating)<0)choices.set(title,{...item,rating});
    }
  }
  return [...choices.values()].sort((a,b)=>compareEveningRatings(a.rating,b.rating)).slice(0,3);
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
