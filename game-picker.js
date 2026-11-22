// Picker used to add games to "Moja kolejka" or to the games being played now.
// Library games are chosen from a filterable list; games outside the library are
// found in the public store catalogue and added to the library automatically.
const pickerTargets = {
  queue: {title:'Dodaj do kolejki', done:'Dodano do kolejki.'},
  playing: {title:'Dodaj do ogrywanych', done:'Dodano do ogrywanych.'},
};
const pickerListLimit = 80;

function pickerEligible(target, game) {
  return !game.archived && (target==='queue' ? !game.pinnedAt && game!==featuredGame() : game.status!=='Gram');
}

function pickerThumb(cover, fallback='') {
  const main=validCustomCover(cover)?cover:web(cover||''), backup=web(fallback||'');
  if(!main && !backup)return '<span class="picker-thumb" aria-hidden="true"></span>';
  return '<span class="picker-thumb" aria-hidden="true"><img loading="lazy" alt="" src="'+esc(main||backup)+'" data-cover-fallback="'+esc(main&&backup!==main?backup:'')+'"></span>';
}

function placeGame(target, item) {
  delete item.archived;
  if(target==='queue') item.pinnedAt=Date.now();
  else {
    item.status='Gram';
    preferences.featuredGameId=item.id;
    savePreferences();
  }
}

function finishPick(target, item) {
  persist();
  dialog.close();
  if(location.hash!=='#now' && location.hash!=='') location.hash='now';
  else render();
  const focus=target==='queue' ? [...app.querySelectorAll('.shelf-game')].find(button=>button.dataset.game===item.id) : app.querySelector('.hero, .feature-panel');
  focus?.scrollIntoView?.({block:'nearest'});
}

function pickLibraryGame(target, id) {
  const item=games.find(entry=>entry.id===id);
  if(!item || deviceBusy || !pickerEligible(target,item))return;
  placeGame(target,item);
  finishPick(target,item);
}

function libraryMatch(title) {
  const key=catalogText(title);
  return games.find(entry=>catalogText(entry.title)===key);
}

function pickCatalogGame(target, choice, store) {
  if(deviceBusy)return;
  const existing=libraryMatch(choice.title);
  if(existing){
    placeGame(target,existing);
    finishPick(target,existing);
    return;
  }
  const system=choice.store || store;
  const item=game(choice.title,system);
  if(choice.store) useCatalogCover(item,choice);
  games.push(item);
  placeGame(target,item);
  finishPick(target,item);
  if(!choice.store) fillExactCover(item,item.title,system).finally(()=>attachCriticScores([item]));
  else attachCriticScores([item]);
}

function openGamePicker(target) {
  if(!Object.hasOwn(pickerTargets,target))return;
  const eligible=games.filter(entry=>pickerEligible(target,entry))
    .sort((a,b)=>Number(b.status==='Gram')-Number(a.status==='Gram') || a.title.localeCompare(b.title,appLocale()));
  const startExternal=!eligible.length;
  const platform=preferences.profile?.platform && systems.includes(preferences.profile.platform) ? preferences.profile.platform : systems[0];
  openForm(t(pickerTargets[target].title),
    '<div class="picker-tabs" role="group" aria-label="'+t('Źródło gry')+'">'+
      '<button type="button" data-picker-tab="library" aria-pressed="'+!startExternal+'">'+t('Z biblioteki')+'</button>'+
      '<button type="button" data-picker-tab="external" aria-pressed="'+startExternal+'">'+t('Szukaj poza biblioteką')+'</button>'+
    '</div>'+
    '<div id="picker-library"'+(startExternal?' hidden':'')+'>'+
      '<label>'+t('Gra z biblioteki')+'<input type="search" id="picker-library-filter" autocomplete="off" enterkeyhint="go" placeholder="'+t('Filtruj po tytule…')+'"></label>'+
      '<div class="picker-list" id="picker-library-list" role="list"></div>'+
      '<p class="muted picker-status" id="picker-library-status" role="status"></p>'+
    '</div>'+
    '<div id="picker-external"'+(startExternal?'':' hidden')+'>'+
      '<p class="muted picker-note">'+t('Wybrana gra zostanie automatycznie dodana do biblioteki.')+'</p>'+
      select(t('Platforma'),'picker-system',systems,platform)+
      '<label>'+t('Tytuł')+'<input type="search" id="picker-catalog-query" autocomplete="off" enterkeyhint="search" maxlength="120" placeholder="'+t('Zacznij wpisywać tytuł…')+'"></label>'+
      '<div class="picker-list" id="picker-catalog-list" role="list"></div>'+
      '<p class="muted picker-status" id="picker-catalog-status" role="status"></p>'+
    '</div>',()=>{});
  document.querySelector('#save').hidden=true;
  wireGamePicker(target,eligible,startExternal);
}

function wireGamePicker(target, eligible, startExternal) {
  const tabs=[...fields.querySelectorAll('[data-picker-tab]')];
  const panes={library:fields.querySelector('#picker-library'),external:fields.querySelector('#picker-external')};
  const filterInput=fields.querySelector('#picker-library-filter');
  const libraryList=fields.querySelector('#picker-library-list');
  const libraryStatus=fields.querySelector('#picker-library-status');
  const query=fields.querySelector('#picker-catalog-query');
  const store=form.elements['picker-system'];
  const catalogList=fields.querySelector('#picker-catalog-list');
  const catalogStatus=fields.querySelector('#picker-catalog-status');
  let found=[], timer, revision=0;

  function showTab(name) {
    for(const tab of tabs) tab.setAttribute('aria-pressed',String(tab.dataset.pickerTab===name));
    panes.library.hidden=name!=='library';
    panes.external.hidden=name!=='external';
    (name==='library'?filterInput:query).focus({preventScroll:true});
  }

  function renderLibrary() {
    const text=catalogText(filterInput.value);
    const matches=text ? eligible.filter(entry=>catalogText(entry.title).includes(text)) : eligible;
    const shown=matches.slice(0,pickerListLimit);
    libraryList.innerHTML=shown.map(entry=>
      '<button type="button" class="picker-option" data-pick-library="'+esc(entry.id)+'">'+
        pickerThumb(gameCoverSource(entry),entry.coverFallback||(entry.steamAppId?steamHeader(entry.steamAppId):''))+
        '<span><strong>'+esc(entry.title)+'</strong><small>'+esc(Object.keys(entry.runs).join(' · '))+' · '+esc(t(entry.status))+'</small></span>'+
      '</button>').join('');
    if(!eligible.length) libraryStatus.textContent=t(target==='queue'?'Wszystkie gry z biblioteki są już w kolejce.':'Wszystkie gry z biblioteki są już ogrywane.');
    else if(!matches.length) libraryStatus.textContent=t('Brak takiej gry w bibliotece. Wyszukaj ją poza biblioteką.');
    else if(matches.length>shown.length) libraryStatus.textContent=t('Wpisz tytuł, aby zawęzić listę.')+' ('+shown.length+' / '+matches.length+')';
    else libraryStatus.textContent='';
    libraryList.hidden=!shown.length;
  }

  function manualOption() {
    const title=query.value.trim();
    if(catalogText(title).length<2 || found.some(item=>catalogText(item.title)===catalogText(title)))return '';
    return '<button type="button" class="picker-option picker-manual" data-pick-catalog="manual">'+
      '<span class="picker-thumb" aria-hidden="true">＋</span><span><strong>'+esc(title)+'</strong><small>'+t('Dodaj jako nową grę')+' · '+esc(store.value)+'</small></span></button>';
  }

  function renderCatalog() {
    catalogList.innerHTML=found.map((item,index)=>{
      const owned=libraryMatch(item.title);
      return '<button type="button" class="picker-option" data-pick-catalog="'+index+'">'+
        pickerThumb(item.cover)+
        '<span><strong>'+esc(item.title)+'</strong><small>'+esc(item.store)+(owned?' · '+t('Już w bibliotece'):'')+'</small></span></button>';
    }).join('')+manualOption();
    catalogList.hidden=!catalogList.children.length;
  }

  async function search(ticket) {
    catalogStatus.textContent=t('Szukam w katalogu…');
    try {
      const next=await catalogSuggestions(query.value,store.value);
      if(ticket!==revision || !dialog.open)return;
      found=next;
      catalogStatus.textContent=found.length?'':t('Brak podpowiedzi. Możesz dodać grę ręcznie.');
    } catch {
      if(ticket!==revision || !dialog.open)return;
      found=[];
      catalogStatus.textContent=t('Katalog chwilowo niedostępny. Możesz dodać grę ręcznie.');
    }
    renderCatalog();
  }

  function scheduleSearch() {
    clearTimeout(timer);
    const ticket=++revision;
    found=[];
    catalogStatus.textContent='';
    renderCatalog();
    if(catalogText(query.value).length>=2) timer=setTimeout(()=>search(ticket),260);
  }

  for(const tab of tabs) tab.onclick=()=>showTab(tab.dataset.pickerTab);
  filterInput.oninput=renderLibrary;
  query.oninput=scheduleSearch;
  store.onchange=scheduleSearch;
  fields.onclick=event=>{
    const button=event.target.closest('button');
    if(button?.dataset.pickLibrary) pickLibraryGame(target,button.dataset.pickLibrary);
    else if(button?.dataset.pickCatalog==='manual') pickCatalogGame(target,{title:query.value.trim()},store.value);
    else if(button?.dataset.pickCatalog) {
      const choice=found[Number(button.dataset.pickCatalog)];
      if(choice) pickCatalogGame(target,choice,store.value);
    }
  };
  for(const list of [libraryList,catalogList]) list.addEventListener('error',event=>{
    const image=event.target;
    if(image.tagName!=='IMG')return;
    if(image.dataset.coverFallback){image.src=image.dataset.coverFallback;image.dataset.coverFallback=''}
    else image.remove();
  },true);
  form.onsubmit=event=>{
    event.preventDefault();
    const pane=panes.library.hidden?catalogList:libraryList;
    if(!pane.hidden) pane.querySelector('.picker-option')?.click();
  };
  dialog.addEventListener('close',()=>{
    clearTimeout(timer);
    revision++;
    fields.onclick=null;
  },{once:true});
  renderLibrary();
  renderCatalog();
  if(!matchMedia('(pointer:coarse)').matches) (startExternal?query:filterInput).focus();
}
