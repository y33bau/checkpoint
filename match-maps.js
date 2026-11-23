const matchMapModes={defuse:'Rozbrajanie bomby',hostage:'Odbijanie zakładników',extraction:'Ekstrakcja'};
const matchMapCatalogue=[
  {
    steamId:730,
    titles:['counter strike 2','cs2','counter strike global offensive','cs go','csgo'],
    maps:[
      ...[
        ['mirage','Mirage'],['inferno','Inferno'],['nuke','Nuke'],['dust2','Dust II'],
        ['ancient','Ancient'],['anubis','Anubis'],['cache','Cache'],
      ].map(([id,title])=>({id:'cs2-'+id,title,mode:'defuse',url:'https://www.steamanalyst.com/callouts/'+id})),
      {id:'cs2-office',title:'Office',mode:'hostage',url:'https://csbepro.com/counter-strike-2/office/'},
    ],
  },
  {
    steamId:1808500,
    titles:['arc raiders'],
    maps:[
      ['dam-battlegrounds','Dam Battlegrounds'],['buried-city','Buried City'],['the-spaceport','The Spaceport'],
      ['blue-gate','Blue Gate'],['stella-montis','Stella Montis'],['riven-tides','Riven Tides'],
    ].map(([id,title])=>({id:'arc-'+id,title,mode:'extraction',url:'https://arcraidersmap.online/arc-raiders-map/'+id+'/'})),
  },
];

function catalogMatchMaps(game) {
  const title=catalogText(game.title);
  return matchMapCatalogue.find(entry=>entry.steamId===Number(game.steamAppId)||entry.titles.includes(title))?.maps||[];
}

function hasMatchMaps(game) {
  return Boolean(game.matchMaps?.length||catalogMatchMaps(game).length);
}

function matchMapMode(mode) {
  return Object.hasOwn(matchMapModes,mode)?t(matchMapModes[mode]):mode;
}

function addMatchMaps(game,entries) {
  const maps=game.matchMaps??=[];
  for(const entry of entries){
    if(!maps.some(map=>map.id===entry.id||resourceKey(map.url)===resourceKey(entry.url)))maps.push({...entry});
  }
}

function prioritizedMatchMaps(game,mode='') {
  return (game.matchMaps||[]).filter(map=>!mode||map.mode===mode).sort((a,b)=>
    Number(b.id===game.lastMatchMap)-Number(a.id===game.lastMatchMap)||
    Number(Boolean(b.favorite))-Number(Boolean(a.favorite))||
    a.title.localeCompare(b.title,appLocale()));
}

function matchMapsCard(game) {
  const maps=hasMatchMaps(game);
  return '<section class="match-maps-shortcut">'+(maps?'<h2>'+t('Mapy rozgrywki')+'</h2>':'')+
    '<div class="actions">'+(maps?btn(t('Otwórz plansze'),'match-maps','primary'):'')+
    btn(t('Dodaj planszę'),'match-map-add')+'</div></section>';
}

function openMatchMaps(game,selectedId=game.lastMatchMap,initialMode='') {
  const saved=game.matchMaps||[];
  const maps=prioritizedMatchMaps(game,initialMode);
  const selected=maps.find(map=>map.id===selectedId);
  const modes=[...new Set(saved.map(map=>map.mode).filter(Boolean))];
  const available=catalogMatchMaps(game).filter(entry=>!saved.some(map=>map.id===entry.id||resourceKey(map.url)===resourceKey(entry.url)));
  const rows=maps.map(map=>{
    const detail=[map.mode&&matchMapMode(map.mode),map.id===game.lastMatchMap&&t('Ostatnio otwarta'),map.favorite&&t('Ulubiona')]
      .filter(Boolean).join(' · ');
    return '<button type="button" class="match-map-row" data-match-choice="'+esc(map.id)+'" aria-pressed="'+(selected===map)+'">'+
      '<strong>'+esc(map.title)+'</strong>'+(detail?'<small>'+esc(detail)+'</small>':'')+'</button>';
  }).join('');
  const importActions=available.length?
    '<button type="button" id="match-import-all">'+t('Dodaj wszystkie plansze')+' · '+available.length+'</button>'+
    '<button type="button" id="match-import-pick">'+t('Wybierz plansze')+'</button>':'';
  const guides=selected&&(selected.guides||[]).map(guide=>
    '<div class="entry saved-guide">'+resourceLink(guide.name,guide.url,'text-link')+
    (guide.goal?'<small>'+esc(guide.goal)+'</small>':'')+'</div>').join('');
  openForm(t('Mapy rozgrywki'),'<p>'+esc(game.title)+'</p>'+
    '<div class="actions">'+importActions+'<button type="button" id="match-add-manual">'+t('Dodaj planszę')+'</button></div>'+
    (modes.length>1?select(t('Tryb gry'),'match-mode',['',...modes],initialMode,id=>id?matchMapMode(id):t('Wszystkie tryby')):'')+
    (rows?'<div class="match-map-list">'+rows+'</div>':'')+
    (!saved.length?'<p class="muted">'+t('Wybierz plansze z zestawu lub dodaj własny link do planu.')+'</p>':'')+
    (selected?'<section class="match-map-detail"><h3>'+esc(selected.title)+'</h3>'+
      '<div class="actions">'+resourceLink(t('Otwórz plan planszy'),selected.url,'button primary')+
      '<button type="button" id="match-favorite" aria-pressed="'+Boolean(selected.favorite)+'">'+
        t(selected.favorite?'Usuń z ulubionych':'Dodaj do ulubionych')+'</button></div>'+
      '<label>'+t('Notatki do planszy')+'<textarea name="match-notes" rows="3" maxlength="3000">'+esc(selected.notes||'')+'</textarea></label>'+
      '<h3>'+t('Poradniki do planszy')+'</h3>'+(guides||'')+
      '<div class="actions"><button type="button" id="match-add-guides">'+t('Wklej linki')+'</button>'+
      resourceLink(t('Szukaj na YouTube'),guideSearch(game,selected.title,'video'))+'</div></section>':''),()=>{});
  const submit=document.querySelector('#save');
  submit.hidden=!selected;
  if(selected)submit.textContent=t('Zapisz notatkę');
  form.onsubmit=event=>{
    event.preventDefault();
    if(!selected||deviceBusy)return;
    selected.notes=form.elements['match-notes'].value.trim();
    persist();
    render();
    submit.textContent=t('Zapisano notatkę');
  };
  const notes=form.elements['match-notes'];
  if(notes)notes.oninput=()=>{submit.textContent=t('Zapisz notatkę')};

  fields.querySelector('#match-add-manual').onclick=()=>openMatchMapManual(game);
  if(available.length){
    fields.querySelector('#match-import-all').onclick=()=>importMatchMaps(game,available);
    fields.querySelector('#match-import-pick').onclick=()=>openMatchMapImport(game,available);
  }
  const mode=form.elements['match-mode'];
  if(mode)mode.onchange=()=>openMatchMaps(game,selectedId,mode.value);
  for(const button of fields.querySelectorAll('[data-match-choice]')){
    button.onclick=()=>{
      if(deviceBusy)return;
      game.lastMatchMap=button.dataset.matchChoice;
      persist();
      openMatchMaps(game,game.lastMatchMap,initialMode);
      fields.querySelector('[data-match-choice][aria-pressed="true"]')?.focus({preventScroll:true});
    };
  }
  if(selected){
    fields.querySelector('#match-favorite').onclick=()=>{
      if(deviceBusy)return;
      selected.favorite=!selected.favorite;
      persist();
      openMatchMaps(game,selected.id,initialMode);
      fields.querySelector('#match-favorite')?.focus({preventScroll:true});
    };
    fields.querySelector('#match-add-guides').onclick=()=>openResourcePaste(game,'guide','',selected);
  }
}

function importMatchMaps(game,entries) {
  if(deviceBusy||!entries.length)return;
  addMatchMaps(game,entries);
  persist();
  render();
  openMatchMaps(game);
}

function openMatchMapImport(game,available) {
  const rows=available.map(map=>'<label class="compact-check"><input type="checkbox" name="match-import" value="'+esc(map.id)+'">'+
    esc(map.title+(map.mode?' · '+matchMapMode(map.mode):''))+'</label>').join('');
  openForm(t('Wybierz plansze'),'<div class="match-import-list">'+rows+'</div>'+
    '<button type="button" id="match-back">'+t('Wróć do plansz')+'</button>',()=>{});
  const save=document.querySelector('#save');
  save.textContent=t('Dodaj wybrane');
  save.disabled=true;
  const boxes=[...fields.querySelectorAll('[name="match-import"]')];
  for(const box of boxes)box.onchange=()=>{save.disabled=!boxes.some(item=>item.checked)};
  fields.querySelector('#match-back').onclick=()=>openMatchMaps(game);
  form.onsubmit=event=>{
    event.preventDefault();
    const ids=new Set(new FormData(form).getAll('match-import'));
    importMatchMaps(game,available.filter(map=>ids.has(map.id)));
  };
}

function openMatchMapManual(game) {
  openForm(t('Dodaj planszę'),input(t('Nazwa planszy'),'match-title','','maxlength="120" required')+
    input(t('Adres planu planszy'),'match-url','','type="url" required')+
    input(t('Tryb gry'),'match-manual-mode','','maxlength="55"')+
    '<p class="muted" id="match-manual-status" role="status"></p>',()=>{});
  form.onsubmit=event=>{
    event.preventDefault();
    if(deviceBusy)return;
    const data=new FormData(form);
    const title=data.get('match-title').trim(),url=web(data.get('match-url'));
    const status=fields.querySelector('#match-manual-status');
    if(!title||!url){status.textContent=t('Wpisz nazwę i poprawny adres planszy.');return}
    const existing=(game.matchMaps||[]).find(map=>resourceKey(map.url)===resourceKey(url));
    if(existing){status.textContent=t('Ta plansza jest już zapisana.');return}
    const map={id:crypto.randomUUID(),title,url,mode:data.get('match-manual-mode').trim()};
    addMatchMaps(game,[map]);
    game.lastMatchMap=map.id;
    persist();
    render();
    openMatchMaps(game,map.id);
  };
}
