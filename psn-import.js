const psnOnlineIdPattern=/^[A-Za-z][A-Za-z0-9_-]{2,15}$/;
let psnImportAvailable=false;
let psnLastCheck;

async function checkPsnImport() {
  const server=steamServerAddress();
  if(!server||(psnLastCheck!==undefined&&Date.now()-psnLastCheck<60000))return;
  psnLastCheck=Date.now();
  let available=false;
  try {
    const response=await fetch(new URL('/api/psn/status',server),{
      cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000),
    });
    available=response.ok&&(await response.json()).ready===true;
  }catch{}
  if(available===psnImportAvailable)return;
  psnImportAvailable=available;
  if(location.hash==='#connections')render();
}
const psnImportErrors={
  invalid_id:'Sprawdź nick PSN. Wpisz nazwę widoczną na profilu PlayStation.',
  profile_unavailable:'Nie udało się odczytać profilu. Sprawdź nick i widoczność historii gier w PlayStation.',
  no_games:'Brak widocznych gier. Sprawdź, czy historia grania w PlayStation jest publiczna.',
  rate_limited:'Za dużo prób importu. Spróbuj ponownie za kilka minut.',
  psn_not_configured:'Szybki import z PlayStation jest chwilowo niedostępny.',
  psn_unavailable:'PlayStation chwilowo nie zwraca historii gier. Spróbuj ponownie później.',
};

async function loadPublicPsnGames(onlineId,signal) {
  if(!psnOnlineIdPattern.test(onlineId))throw Error(t(psnImportErrors.invalid_id));
  const server=steamServerAddress();
  if(!server)throw Error(t(psnImportErrors.psn_not_configured));
  const response=await fetch(new URL('/api/psn/library',server),{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({onlineId}),cache:'no-store',redirect:'error',signal,
  });
  const data=await response.json();
  if(!response.ok){
    const code=data?.error==='not_found'?'psn_not_configured':data?.error;
    throw Error(t(Object.hasOwn(psnImportErrors,code)?psnImportErrors[code]:psnImportErrors.psn_unavailable));
  }
  if(data?.onlineId?.toLowerCase()!==onlineId.toLowerCase())throw Error(t(psnImportErrors.psn_unavailable));
  return data;
}

function openPsnImport() {
  const locale=appLanguage()==='pl'?'pl-pl':'en-us';
  openForm(t('Importuj z PlayStation'),
    '<p class="muted">'+t('Wczytamy gry z publicznej historii grania na Twoim profilu.')+'</p>'+
    input(t('Nick PSN'), 'onlineId', connections.ps?.profile,
      'autofocus required minlength="3" maxlength="16" autocapitalize="none" autocomplete="off" spellcheck="false"')+
    '<a class="text-link" href="https://www.playstation.com/'+locale+'/support/account/privacy-settings/" target="_blank" rel="noopener noreferrer">'+
    t('Ustawienia prywatności PlayStation')+'</a>'+
    '<p id="psn-import-status" role="status"></p>',()=>{});
  const submit=document.querySelector('#save');
  const status=document.querySelector('#psn-import-status');
  submit.textContent=t('Importuj gry');
  form.onsubmit=async event=>{
    event.preventDefault();
    if(submit.disabled||deviceBusy)return;
    const onlineId=new FormData(form).get('onlineId').trim();
    submit.disabled=true;
    status.textContent=t('Pobieram bibliotekę…');
    const controller=new AbortController();
    const cancel=()=>controller.abort();
    const timeout=setTimeout(cancel,45000);
    dialog.addEventListener('close',cancel,{once:true});
    try {
      const data=await loadPublicPsnGames(onlineId,controller.signal);
      if(!dialog.open||document.querySelector('#psn-import-status')!==status||deviceBusy)return;
      const rows=normalizeSourceRows(data,'ps');
      if(!rows.length)throw Error(t(psnImportErrors.no_games));
      const before=structuredClone(games);
      let result;
      try { result=mergeNormalizedSource(rows,'ps',persist); }
      catch {
        games=before;
        throw Error(t('Nie udało się zapisać importu.'));
      }
      connections.ps={...connections.ps,profile:data.onlineId};
      recordLastImport('ps',result.count,result.added,'psn-profile');
      setSourceStatus('ps',importMessage(data,result));
      dialog.close();
      render();
    }catch(error){
      status.textContent=['TypeError','AbortError','SyntaxError'].includes(error.name)?
        t(psnImportErrors.psn_unavailable):error.message;
    }finally{
      clearTimeout(timeout);
      dialog.removeEventListener('close',cancel);
      if(document.querySelector('#psn-import-status')===status)submit.disabled=false;
    }
  };
}
