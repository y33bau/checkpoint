const pickerListLimit = 40;
const pickerTargets = { playing:'Gram', queue:'Do kolejki' };

function pickerThumb(cover, fallback='') {
  const main=validCustomCover(cover)?cover:web(cover||''), backup=web(fallback||'');
  if(!main && !backup)return '<span class="picker-thumb" aria-hidden="true"></span>';
  return '<span class="picker-thumb" aria-hidden="true"><img loading="lazy" alt="" src="'+esc(main||backup)+'" data-cover-fallback="'+esc(main&&backup!==main?backup:'')+'"></span>';
}

function placeGame(target, item) {
  delete item.archived;
  if(target==='queue') item.pinnedAt??=Date.now();
  else {
    item.status='Gram';
    preferences.featuredGameId=item.id;
    savePreferences();
  }
}

function libraryMatch(choice) {
  const title=catalogText(choice.title);
  const sameId=choice.steamId&&games.find(entry=>entry.steamAppId===choice.steamId);
  return sameId||games.find(entry=>catalogText(entry.title)===title&&
    (!choice.steamId||!entry.steamAppId||choice.steamId===entry.steamAppId));
}

function placeCatalogueGame(target, choice, platform) {
  const system=choice.store||platform;
  const existing=libraryMatch(choice);
  const item=existing||game(choice.title,system);
  const newPlatform=!Object.hasOwn(item.runs,system);
  if(newPlatform)item.runs[system]=run();
  if(target==='playing')item.system=system;
  if(choice.store){
    if(!existing||!item.cover)useCatalogCover(item,choice);
    else item.catalogVersions={...item.catalogVersions,[choice.store]:choice.versions||[]};
  }
  if(choice.steamId&&!item.steamAppId)item.steamAppId=choice.steamId;
  if(!existing)games.push(item);
  placeGame(target,item);
  if(!existing||newPlatform){
    if(!choice.store&&!item.cover)fillExactCover(item,item.title,system).finally(()=>attachCriticScores([item]));
    else attachCriticScores([item]);
  }
  return item;
}

function pickerLibraryResults(query) {
  const words=catalogText(query).split(' ').filter(Boolean);
  const rank=entry=>{
    const title=catalogText(entry.title);
    if(!words.length)return Number(entry.status!=='Gram');
    if(title===words.join(' '))return 0;
    if(title.startsWith(words.join(' ')))return 1;
    return words.every(word=>title.includes(word))?2:3;
  };
  return games.map(entry=>({entry,rank:rank(entry)})).filter(row=>row.rank<3)
    .sort((a,b)=>a.rank-b.rank||Number(Boolean(a.entry.archived))-Number(Boolean(b.entry.archived))||
      a.entry.title.localeCompare(b.entry.title,appLocale()))
    .map(row=>row.entry).slice(0,pickerListLimit);
}

function pickerActions(entry,target) {
  const buttons=[target,target==='queue'?'playing':'queue'];
  return '<div class="picker-row-actions">'+buttons.map(action=>{
    const saved=entry&&!entry.archived&&(action==='queue'?entry.pinnedAt:entry.status==='Gram');
    const label=saved&&action==='queue'?'W kolejce':pickerTargets[action];
    return '<button type="button" data-pick-target="'+action+'"'+(saved&&action==='queue'?' disabled':'')+'>'+t(label)+'</button>';
  }).join('')+'</div>';
}

function openGamePicker(target='playing') {
  if(!Object.hasOwn(pickerTargets,target))return;
  const saved=preferences.profile?.platform;
  const platform=systems.includes(saved)?saved:systems[0];
  openForm(t('Dodaj grę'),
    '<div class="quick-picker-controls">'+
    input(t('Szukaj gry'),'quick-game-query','','type="search" autocomplete="off" maxlength="120"')+
    select(t('Platforma katalogu'),'picker-system',systems,platform)+'</div>'+
    '<div id="picker-library" class="quick-picker-group"></div>'+
    '<div id="picker-catalog" class="quick-picker-group"></div>'+
    '<p class="muted picker-status" id="picker-status" role="status"></p>'+
    '<button type="button" id="picker-detailed-add">'+t('Dodaj z formularza')+'</button>',()=>{});
  document.querySelector('#save').hidden=true;
  const query=form.elements['quick-game-query'];
  const store=form.elements['picker-system'];
  const local=fields.querySelector('#picker-library');
  const external=fields.querySelector('#picker-catalog');
  const status=fields.querySelector('#picker-status');
  let choices=[], timer, revision=0;

  const row=(kind,id,entry,details,thumb,existing)=>'<div class="picker-option" data-pick-kind="'+kind+'" data-pick-id="'+esc(id)+'">'+
    thumb+'<div class="picker-row-info"><strong title="'+esc(entry.title)+'">'+esc(entry.title)+'</strong>'+
    '<small>'+esc(details)+'</small></div>'+pickerActions(existing,target)+'</div>';

  function renderResults(showManual=false) {
    const matches=pickerLibraryResults(query.value);
    local.innerHTML=matches.length?'<h3>'+t('Z biblioteki')+'</h3><div class="picker-list">'+matches.map(entry=>
      row('library',entry.id,entry,Object.keys(entry.runs).join(' · ')+' · '+t(entry.archived?'Archiwum':entry.status),
        pickerThumb(gameCoverSource(entry),entry.coverFallback),entry)).join('')+'</div>':'';
    const rows=choices.flatMap((choice,index)=>{
      const existing=libraryMatch(choice);
      if(existing?.runs[choice.store])return [];
      return row('catalogue',index,choice,choice.store,pickerThumb(choice.cover),null);
    });
    const title=query.value.trim();
    const exact=catalogText(title);
    if(showManual&&exact.length>=2&&!choices.some(choice=>catalogText(choice.title)===exact)&&
        !matches.some(entry=>catalogText(entry.title)===exact)){
      rows.push(row('manual','',{title},t('Dodaj ręcznie')+' · '+store.value,pickerThumb(''),null));
    }
    external.innerHTML=rows.length?'<h3>'+t('Z katalogu')+'</h3><div class="picker-list">'+rows.join('')+'</div>':'';
  }

  async function search(ticket) {
    try {
      const results=await catalogSuggestions(query.value,store.value);
      if(ticket!==revision||!query.isConnected||!dialog.open)return;
      choices=results;
      status.textContent='';
    }catch{
      if(ticket!==revision||!query.isConnected||!dialog.open)return;
      status.textContent=t('Katalog chwilowo niedostępny. Możesz dodać grę ręcznie.');
    }
    renderResults(true);
  }

  function scheduleSearch() {
    clearTimeout(timer);
    const ticket=++revision;
    choices=[];
    const searching=catalogText(query.value).length>=2;
    status.textContent=searching?t('Szukam w katalogu…'):'';
    renderResults(searching);
    if(searching)timer=setTimeout(()=>search(ticket),260);
  }

  function choose(event) {
    const action=event.target.closest('button[data-pick-target]')?.dataset.pickTarget;
    const result=event.target.closest('[data-pick-kind]');
    if(!action||!result||deviceBusy)return;
    const {pickKind:kind,pickId:id}=result.dataset;
    if(kind==='library'){
      const item=games.find(entry=>entry.id===id);
      if(!item)return;
      placeGame(action,item);
    }else{
      const choice=kind==='manual'?{title:query.value.trim()}:choices[Number(id)];
      if(!choice)return;
      placeCatalogueGame(action,choice,store.value);
    }
    persist();
    dialog.close();
    render();
  }

  fields.querySelector('#picker-detailed-add').onclick=()=>openGameForm(null,null,query.value.trim());
  query.oninput=scheduleSearch;
  store.onchange=scheduleSearch;
  for(const group of [local,external]){
    group.onclick=choose;
    group.addEventListener('error',event=>{
      const image=event.target;
      if(image.tagName!=='IMG')return;
      if(image.dataset.coverFallback){image.src=image.dataset.coverFallback;image.dataset.coverFallback=''}
      else image.remove();
    },true);
  }
  form.onsubmit=event=>{
    event.preventDefault();
    fields.querySelector('button[data-pick-target="'+target+'"]:not(:disabled)')?.click();
  };
  dialog.addEventListener('close',()=>{clearTimeout(timer);revision++},{once:true});
  renderResults();
  query.focus({preventScroll:true});
}
