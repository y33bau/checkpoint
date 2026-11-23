let wandCatalogue;

function resourceLink(label,url,className='button') {
  return '<a class="'+className+'" href="'+esc(web(url))+'" target="_blank" rel="noopener noreferrer">'+esc(label)+'</a>';
}

function primaryGameMap(game) {
  return game.maps.find(map=>web(map.url));
}

function primaryGuideLink(game) {
  const guides=game.guides||[];
  const goal=catalogText(game.runs[game.system].goal||'');
  const forGoal=goal&&guides.findLast(item=>item.goal&&catalogText(item.goal)===goal&&web(item.url));
  const guide=forGoal||guides.findLast(item=>!item.goal&&web(item.url))||guides.findLast(item=>web(item.url));
  return guide?resourceLink(t('Poradnik'),guide.url):btn(t('Poradnik'),'stuck');
}

function quickResources(game) {
  const map=primaryGameMap(game);
  return (map?resourceLink(t('Otwórz mapę'),map.url):btn(t('Otwórz mapę'),'wand-maps'))+
    (hasMatchMaps(game)?btn(t('Mapy rozgrywki'),'match-maps'):'')+
    primaryGuideLink(game)+btn(t('Utknąłem'),'stuck');
}

function resourceSource(url) {
  const host=new URL(url).hostname.toLowerCase().replace(/^www\./,'');
  if(['wand.com','wemod.com','mapgenie.io'].some(domain=>host===domain||host.endsWith('.'+domain)))
    return {name:host.endsWith('mapgenie.io')?'Map Genie':'Wand',type:'map'};
  if(host==='steamanalyst.com'&&new URL(url).pathname.startsWith('/callouts/'))return {name:'SteamAnalyst',type:'map'};
  if(host==='arcraidersmap.online'&&new URL(url).pathname.startsWith('/arc-raiders-map/'))return {name:'Raider Grid',type:'map'};
  if(host==='youtu.be'||host==='youtube.com'||host.endsWith('.youtube.com'))
    return {name:'YouTube',type:'guide'};
  return {name:host,type:'guide'};
}

function resourceKey(url) {
  const checked=web(url);
  if(!checked)return '';
  const key=new URL(checked);
  key.hostname=key.hostname.replace(/^www\./,'');
  if(key.hostname==='wand.com')key.pathname=key.pathname.replace(/^\/[a-z]{2}(?=\/maps(?:\/|$))/,'');
  for(const name of [...key.searchParams.keys()]){
    if(name.startsWith('utm_')||name==='fbclid'||name==='gclid'||(name==='si'&&['youtube.com','youtu.be'].includes(key.hostname)))key.searchParams.delete(name);
  }
  if(key.hostname==='youtu.be'){
    key.hostname='youtube.com';
    key.searchParams.set('v',key.pathname.slice(1));
    key.pathname='/watch';
  }
  key.searchParams.sort();
  return key.href;
}

function pastedResources(text,preferredType='') {
  const links=new Map();
  for(const candidate of text.match(/https?:\/\/[^\s<>"|]+/gi)||[]){
    const url=web(candidate.replace(/[,.;)\]]+$/,''));
    if(!url)continue;
    const source=resourceSource(url);
    const key=resourceKey(url);
    if(!links.has(key))links.set(key,{url,name:source.name,type:preferredType||source.type});
  }
  return [...links.values()];
}

function addPickedResources(game,links,goal='',matchMap=null) {
  let added=0;
  for(const {url,name,type} of links){
    const map=type==='map'&&!matchMap;
    const list=matchMap?(matchMap.guides??=[]):map?game.maps:(game.guides??=[]);
    const forGoal=map?'':goal;
    if(list.some(item=>resourceKey(item.url)===resourceKey(url)&&(item.goal||'')===forGoal))continue;
    list.push(forGoal?{name,url,goal:forGoal}:{name,url});
    added++;
  }
  return added;
}

function openResourcePaste(game,preferredType='',goal='',matchMap=null) {
  openForm(t('Wklej linki'),
    '<p>'+esc(game.title+(matchMap?' · '+matchMap.title:''))+'</p>'+
    '<label>'+t('Adresy map i poradników')+'<textarea name="urls" rows="4" placeholder="https://…" required></textarea></label>'+
    '<p role="status" id="resource-summary"></p>'+
    select(t('Rodzaj linku'),'kind',['','map','guide'],preferredType,id=>t({'':'Automatyczny',map:'Mapa',guide:'Poradnik'}[id]))+
    '<label id="resource-name">'+t('Nazwa linku')+'<input name="name" maxlength="120"></label>'+
    '<label id="resource-goal">'+t('Powiąż z celem (opcjonalnie)')+
    '<input name="goal" maxlength="180" value="'+esc(goal)+'"></label>',()=>{});
  const {urls,kind,goal:goalInput,name}=form.elements;
  if(matchMap)kind.closest('label').hidden=true;
  const links=()=>pastedResources(urls.value,matchMap?'guide':kind.value);

  function preview() {
    const entries=links();
    fields.querySelector('#resource-summary').textContent=entries.length
      ?t('Linki do dodania')+' · '+entries.length+' · '+[...new Set(entries.map(row=>row.name))].join(', '):'';
    fields.querySelector('#resource-name').hidden=entries.length!==1;
    fields.querySelector('#resource-goal').hidden=kind.value==='map'||(entries.length>0&&entries.every(row=>row.type==='map'));
  }

  urls.oninput=kind.onchange=preview;
  form.onsubmit=event=>{
    event.preventDefault();
    const entries=links();
    if(!entries.length){fields.querySelector('#resource-summary').textContent=t('Wpisz adres https lub http.');return}
    if(entries.length===1&&name.value.trim())entries[0].name=name.value.trim();
    const added=addPickedResources(game,entries,goalInput.value.trim(),matchMap);
    if(!added){fields.querySelector('#resource-summary').textContent=t('Te linki są już zapisane.');return}
    persist();
    if(matchMap)openMatchMaps(game,matchMap.id);
    else {dialog.close();render()}
  };
  preview();
  urls.focus({preventScroll:true});
}

function guideSearch(game,goal,source) {
  const query=[game.title,goal,t('poradnik')].filter(Boolean).join(' ');
  const url=new URL(source==='video'?'https://www.youtube.com/results':'https://www.google.com/search');
  url.searchParams.set(source==='video'?'search_query':'q',query);
  return url.href;
}

function openStuck(game) {
  const run=game.runs[game.system];
  const goal=run.goal?.trim()||game.tasks.find(task=>!task.done&&task.pinned)?.name||'';
  const goals=[...new Set([goal,...game.tasks.filter(task=>!task.done).map(task=>task.name)].filter(Boolean))];
  openForm(t('Utknąłem'),
    '<p>'+esc(game.title)+'</p>'+input(t('Czego szukasz?'),'query',goal,'maxlength="180" list="game-goal-options"')+
    '<datalist id="game-goal-options">'+goals.map(name=>'<option value="'+esc(name)+'"></option>').join('')+'</datalist>'+
    '<div class="actions" id="goal-searches"></div><div id="saved-goal-guides"></div>'+
    '<details class="extra-options"><summary>'+t('Pełna solucja (spoilery)')+'</summary><div class="actions">'+
    resourceLink(t('Szukaj pełnej solucji'),guideSearch(game,t('pełna solucja'),'web'))+
    '</div></details><button type="button" id="pin-guide">'+t('Przypnij poradnik')+'</button>',()=>{});
  document.querySelector('#save').hidden=true;
  const query=form.elements.query;
  const paint=()=>{
    fields.querySelector('#goal-searches').innerHTML=
      resourceLink(t('Szukaj na YouTube'),guideSearch(game,query.value.trim(),'video'))+
      resourceLink(t('Szukaj poradnika w sieci'),guideSearch(game,query.value.trim(),'web'));
    fields.querySelector('#saved-goal-guides').innerHTML=(game.guides||[])
      .filter(item=>item.goal&&catalogText(item.goal)===catalogText(query.value.trim()))
      .map(item=>resourceLink(item.name,item.url,'entry')).join('');
  };
  query.oninput=paint;
  form.onsubmit=event=>event.preventDefault();
  fields.querySelector('#pin-guide').onclick=()=>{
    const target=query.value.trim();
    openResourcePaste(game,'guide',target);
  };
  paint();
}

function loadWandCatalogue() {
  wandCatalogue??=fetch('assets/wand-maps.json?v=resources31',{signal:AbortSignal.timeout(8000)})
    .then(response=>{if(!response.ok)throw Error('Wand catalogue unavailable');return response.json()})
    .catch(error=>{wandCatalogue=undefined;throw error});
  return wandCatalogue;
}

function wandMatches(rows,game,query) {
  const title=catalogText(query);
  if(!title)return [];
  return rows.map(row=>{
    const name=catalogText(row.title);
    const sameId=query===game.title && game.steamAppId && String(game.steamAppId)===row.steamId;
    const rank=sameId?0:name===title?1:name.startsWith(title+' ')?2:name.includes(title)?3:4;
    return {row,rank};
  }).filter(({rank})=>rank<4).sort((a,b)=>a.rank-b.rank).slice(0,6).map(({row})=>row);
}

function wandExactMatch(rows,game) {
  const id=String(game.steamAppId||'');
  const byId=id?rows.filter(row=>String(row.steamId)===id):[];
  if(byId.length)return byId.length===1?byId[0]:null;
  const exact=rows.filter(row=>catalogText(row.title)===catalogText(game.title));
  return exact.length===1?exact[0]:null;
}

function wandMapLinks(items) {
  const localePath=appLanguage()==='pl'?'/pl':'';
  return items.filter(item=>item.path?.startsWith('/maps/')).map(item=>({
    name:item.name||item.title,type:'map',url:'https://wand.com'+localePath+item.path,
  }));
}

function wandImportButton(game,items,label,onImport=()=>{}) {
  const links=wandMapLinks(items);
  const missing=()=>links.filter(link=>!game.maps.some(map=>resourceKey(map.url)===resourceKey(link.url)));
  const button=document.createElement('button');
  button.type='button';
  const refresh=()=>{
    button.disabled=!missing().length;
    button.textContent=button.disabled?t('Przypięto'):label;
  };
  button.onclick=()=>{
    if(deviceBusy)return;
    addPickedResources(game,missing());
    persist();
    refresh();
    onImport();
    render();
  };
  refresh();
  return button;
}

async function wireWandQuickImport(game) {
  const container=app.querySelector('#wand-quick-import');
  if(!container)return;
  try {
    const row=wandExactMatch(await loadWandCatalogue(),game);
    if(!row||!container.isConnected)return;
    const primary=row.regions?.[0]||row;
    container.append(wandImportButton(game,[primary],t('Dodaj mapę')+' · '+(primary.name||primary.title)));
    if(row.regions?.length>1)container.append(wandImportButton(game,row.regions,t('Dodaj wszystkie regiony')));
  }catch{ /* The manual link and catalogue controls remain available. */ }
}

async function openWandMaps(game) {
  const localePath=appLanguage()==='pl'?'/pl':'';
  openForm(t('Mapy z Wand'),'<p>'+esc(game.title)+'</p>'+
    input(t('Szukaj gry'),'query',game.title,'maxlength="120"')+
    '<div id="wand-matches" aria-live="polite"></div><div class="actions">'+
    resourceLink(t('Przeglądaj katalog Wand'),'https://wand.com'+localePath+'/maps')+
    '<button type="button" id="wand-paste">'+t('Wklej linki')+'</button></div>',()=>{});
  document.querySelector('#save').hidden=true;
  form.onsubmit=event=>event.preventDefault();
  const results=fields.querySelector('#wand-matches');
  const query=form.elements.query;
  fields.querySelector('#wand-paste').onclick=()=>openResourcePaste(game,'map');
  results.textContent=t('Szukam map w Wand…');
  try{
    const rows=await loadWandCatalogue();
    if(!dialog.open||!results.isConnected)return;
    const paint=()=>{
      const matches=wandMatches(rows,game,query.value.trim());
      results.replaceChildren();
      if(!matches.length){results.textContent=t('Brak pasujących map. Wyszukaj inny tytuł lub wklej link.');return}
      for(const row of matches){
        const group=document.createElement('section');
        group.className='wand-match';
        const items=[{name:row.title,path:row.path,heading:t('Wszystkie mapy gry')},...(row.regions||[])];
        group.innerHTML='<strong>'+esc(row.title)+'</strong>';
        if(row.regions?.length>1){
          const all=document.createElement('div');
          all.className='actions';
          all.append(wandImportButton(game,row.regions,t('Dodaj wszystkie regiony'),paint));
          group.append(all);
        }
        for(const item of items){
          const link=wandMapLinks([item])[0];
          if(!link)continue;
          const line=document.createElement('div');
          line.className='wand-result';
          line.innerHTML=resourceLink(item.heading||item.name,link.url,'text-link');
          line.append(wandImportButton(game,[item],t('Przypnij'),paint));
          group.append(line);
        }
        results.append(group);
      }
    };
    query.oninput=paint;
    paint();
  }catch{
    if(results.isConnected)results.textContent=t('Katalog Wand jest chwilowo niedostępny.');
  }
}
