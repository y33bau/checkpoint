let wandCatalogue;

function resourceLink(label,url,className='button') {
  return '<a class="'+className+'" href="'+esc(web(url))+'" target="_blank" rel="noopener noreferrer">'+esc(label)+'</a>';
}

function primaryGameMap(game) {
  return game.maps.find(map=>web(map.url));
}

function quickResources(game) {
  const map=primaryGameMap(game);
  return (map?resourceLink(t('Otwórz mapę'),map.url):btn(t('Otwórz mapę'),'wand-maps'))+
    btn(t('Utknąłem'),'stuck')+btn(t('Wklej link'),'resource-paste');
}

function resourceSource(url) {
  const host=new URL(url).hostname.toLowerCase().replace(/^www\./,'');
  if(['wand.com','wemod.com','mapgenie.io'].some(domain=>host===domain||host.endsWith('.'+domain)))
    return {name:host.endsWith('mapgenie.io')?'Map Genie':'Wand',type:'map'};
  if(host==='youtu.be'||host==='youtube.com'||host.endsWith('.youtube.com'))
    return {name:'YouTube',type:'guide'};
  return {name:host,type:'guide'};
}

function saveGameResource(game,type,name,url,goal='') {
  const list=type==='map'?game.maps:(game.guides??=[]);
  const existing=list.find(item=>web(item.url)===url && (item.goal||'')===goal);
  if(existing)existing.name=name;
  else list.push(goal?{name,url,goal}:{name,url});
}

function openResourcePaste(game,preferredType='',goal) {
  const requestedGoal=goal??(game.runs[game.system].goal?.trim()||'');
  const labels={map:t('Mapa'),guide:t('Poradnik')};
  openForm(t('Wklej link'),
    '<p>'+esc(game.title)+'</p>'+
    input(t('Adres linku'),'url','','type="url" required')+
    '<p role="status" id="resource-source"></p>'+
    select(t('Rodzaj linku'),'kind',Object.keys(labels),preferredType||'guide',id=>labels[id])+
    input(t('Nazwa linku'),'name','','maxlength="120"')+
    '<label id="resource-goal">'+t('Powiąż z celem (opcjonalnie)')+
    '<input name="goal" maxlength="180" value="'+esc(requestedGoal)+'"></label>',data=>{
      const url=web(data.get('url'));
      if(!url)throw Error(t('Wpisz adres https lub http.'));
      const type=data.get('kind');
      const name=data.get('name').trim()||resourceSource(url).name;
      saveGameResource(game,type,name,url,type==='guide'?data.get('goal').trim():'');
    });
  const {url,kind,goal:goalInput}=form.elements;
  let manualType=Boolean(preferredType);
  const updateGoal=()=>{
    fields.querySelector('#resource-goal').hidden=kind.value!=='guide';
    goalInput.disabled=kind.value!=='guide';
  };
  kind.onchange=()=>{manualType=true;updateGoal()};
  url.oninput=()=>{
    const valid=web(url.value);
    const source=valid?resourceSource(valid):null;
    fields.querySelector('#resource-source').textContent=source?t('Źródło')+' · '+source.name:'';
    if(source&&!manualType)kind.value=source.type;
    updateGoal();
  };
  updateGoal();
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
    dialog.close();
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

async function openWandMaps(game) {
  const localePath=appLanguage()==='pl'?'/pl':'';
  openForm(t('Mapy z Wand'),'<p>'+esc(game.title)+'</p>'+
    input(t('Szukaj gry'),'query',game.title,'maxlength="120"')+
    '<div id="wand-matches" aria-live="polite"></div><div class="actions">'+
    resourceLink(t('Przeglądaj katalog Wand'),'https://wand.com'+localePath+'/maps')+
    '<button type="button" id="wand-paste">'+t('Wklej link')+'</button></div>',()=>{});
  document.querySelector('#save').hidden=true;
  form.onsubmit=event=>event.preventDefault();
  const results=fields.querySelector('#wand-matches');
  const query=form.elements.query;
  fields.querySelector('#wand-paste').onclick=()=>{dialog.close();openResourcePaste(game,'map')};
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
        for(const item of items){
          const url=web('https://wand.com'+localePath+item.path);
          const line=document.createElement('div');
          line.className='wand-result';
          line.innerHTML=resourceLink(item.heading||item.name,url,'text-link')+
            '<button type="button">'+t('Przypnij')+'</button>';
          const button=line.querySelector('button');
          const isSaved=()=>game.maps.some(map=>web(map.url)===url);
          const refresh=()=>{button.disabled=isSaved();button.textContent=t(button.disabled?'Przypięto':'Przypnij')};
          button.onclick=()=>{
            saveGameResource(game,'map',item.name,url);
            persist();
            refresh();
            render();
          };
          refresh();
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
