function createImportReview(provider, rows, getTitle, getId) {
  const system=provider==='steam'?'Steam':librarySources[provider].platform;
  const titles=new Map();
  const ids=new Map();
  for(const game of games){
    const id=provider==='steam'?game.steamAppId:game.sourceIds?.[provider];
    if(id!=null)ids.set(String(id),game);
    const title=catalogText(game.title);
    if((provider!=='steam'||!id) && (!titles.has(title)||game.runs[system]))titles.set(title,game);
  }
  return rows.map(row=>{
    const title=getTitle(row);
    const id=getId(row);
    const existing=(id!=null?ids.get(String(id)):null)||titles.get(catalogText(title));
    const status=existing?(existing.runs[system]||provider==='wand'?'Już w bibliotece':'Dodaj platformę'):'Nowa gra';
    return {row,title,status};
  });
}

function openImportReview(provider, items, apply) {
  if(dialog.open)throw Error(t('Zamknij otwarty formularz i spróbuj ponownie.'));
  if(!items.length){
    setImportSourceMessage(provider,t('Źródło nie zwróciło gier.'));
    render();
    return;
  }
  const name=provider==='steam'?'Steam':librarySources[provider].name;
  const selected=new Set(items.map((_,index)=>index));
  const formatter=new Intl.NumberFormat(appLocale());
  let shown=40;
  openForm(t('Podgląd importu')+' · '+name,
    '<p>'+formatter.format(items.filter(item=>item.status==='Nowa gra').length)+' '+t('nowych')+' · '+
    formatter.format(items.filter(item=>item.status==='Już w bibliotece').length)+' '+t('już w bibliotece')+' · '+
    formatter.format(items.filter(item=>item.status==='Dodaj platformę').length)+' '+t('do połączenia z istniejącymi grami')+'</p>'+
    '<p class="muted">'+t('Dane zapisują się w tej przeglądarce.')+'</p>'+
    '<div class="actions import-review-controls"><button type="button" data-review-all>'+t('Zaznacz wszystkie')+'</button>'+
    '<button type="button" data-review-none>'+t('Odznacz wszystkie')+'</button></div>'+
    '<div id="import-review-list"></div><button type="button" id="import-review-more">'+t('Pokaż kolejne')+'</button>'+
    '<p id="import-review-status" class="muted" role="status"></p>',()=>{});
  const list=document.querySelector('#import-review-list');
  const more=document.querySelector('#import-review-more');
  const status=document.querySelector('#import-review-status');
  const submit=document.querySelector('#save');

  function updateCount() {
    status.textContent=t('Wybrane gry')+' · '+formatter.format(selected.size)+' / '+formatter.format(items.length);
    submit.disabled=!selected.size;
    submit.textContent=t('Importuj wybrane');
  }
  function paintList(){
    list.innerHTML=items.slice(0,shown).map((item,index)=>
      '<label class="import-review-row"><input type="checkbox" data-review-index="'+index+'"'+(selected.has(index)?' checked':'')+
      '><span><strong>'+esc(item.title)+'</strong><small>'+t(item.status)+'</small></span></label>').join('');
    more.hidden=shown>=items.length;
    updateCount();
  }
  list.onchange=event=>{
    const index=Number(event.target.dataset.reviewIndex);
    if(!Number.isInteger(index)||!items[index])return;
    if(event.target.checked) selected.add(index); else selected.delete(index);
    updateCount();
  };
  fields.querySelector('[data-review-all]').onclick=()=>{items.forEach((_,index)=>selected.add(index));paintList()};
  fields.querySelector('[data-review-none]').onclick=()=>{selected.clear();paintList()};
  more.onclick=()=>{
    const first=shown;
    shown+=40;
    paintList();
    list.querySelector('[data-review-index="'+first+'"]')?.focus();
  };
  form.onsubmit=event=>{
    event.preventDefault();
    if(!selected.size||deviceBusy)return;
    submit.disabled=true;
    try{
      const rows=items.filter((_,index)=>selected.has(index)).map(item=>item.row);
      apply(rows);
      dialog.close();
      render();
    }catch{
      status.textContent=t('Nie udało się zapisać importu.');
      submit.disabled=false;
    }
  };
  // The shared save button is reused across dialogs.
  dialog.addEventListener('close',()=>{submit.disabled=false},{once:true});
  paintList();
}

function setImportSourceMessage(provider,message) {
  if(provider==='steam')steamMessage=message;
  else setSourceStatus(provider,message);
}

function recordLastImport(provider,count,added,mode) {
  const existing=connections[provider] || {profile:''};
  const at=new Date().toISOString();
  connections[provider]={...existing,lastImport:{count,added,mode,at}};
  if(mode==='sync'){
    if(provider==='steam')connections[provider].syncedAt=at;
    else connections[provider].librarySyncedAt=at;
  }
  localStorage.setItem(connectionKey,JSON.stringify(connections));
}

function lastImportMarkup(saved) {
  const record=saved?.lastImport;
  if(!record || !Number.isInteger(record.count)||!Number.isInteger(record.added))return '';
  const date=new Date(record.at);
  const timestamp=Number.isFinite(date.valueOf())?date.toLocaleDateString(appLocale()):'';
  const format=new Intl.NumberFormat(appLocale());
  const summary=[timestamp,format.format(record.count)+' '+t('gier'),
    record.added>0?t('Nowe gry')+' · '+format.format(record.added):''].filter(Boolean).join(' · ');
  return '<div class="import-next"><p class="last-import-summary">'+t('Ostatni import')+' · '+esc(summary)+'</p>'+
    (record.count>0?btn(t('Wybierz grę na 30 min'),'evening-after-import'):'')+'</div>';
}

function steamGameRows(data) {
  const items=data?.response?.games ?? data?.games;
  if(!Array.isArray(items))throw Error(t('Brak dostępnej listy gier Steam.'));
  const valid=items.filter(item=>typeof item?.name==='string'&&item.name.trim()&&Number.isInteger(item.appid)&&item.appid>0);
  if(items.length&&!valid.length)throw Error(t('Lista Steam nie zawiera tytułów i identyfikatorów gier.'));
  return [...new Map(valid.map(item=>[item.appid,item])).values()];
}

function previewSteam(data,mode) {
  const items=createImportReview('steam',steamGameRows(data),item=>item.name,item=>item.appid);
  openImportReview('steam',items,rows=>{
    const before=games.length;
    const count=importSteamGames({games:rows});
    persist();
    recordLastImport('steam',count,games.length-before,mode);
    steamMessage=t('Zaktualizowano gry Steam')+' · '+count;
    if(mode==='sync'){
      const appids=new Set(rows.map(row=>row.appid));
      importSteamAchievementsAfterSync(games.filter(item=>appids.has(item.steamAppId)));
    }
  });
}

function previewConsole(data,provider,mode) {
  const items=createImportReview(provider,normalizeSourceRows(data,provider),row=>row.title,row=>row.id||null);
  openImportReview(provider,items,rows=>{
    const result=mergeNormalizedSource(rows,provider);
    recordLastImport(provider,result.count,result.added,mode);
    setSourceStatus(provider,importMessage(data,result));
  });
}
