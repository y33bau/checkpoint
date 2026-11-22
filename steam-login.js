// Steam sign-in through the shared Checkpoint server.
// The browser keeps a PKCE verifier in sessionStorage for the trip to Steam, trades the
// one-time code for a short-lived import token and holds that token in memory only.
const steamPendingKey='checkpoint-steam-login-v2';
const steamLocalServerKey='checkpoint-steam-server-local';
const steamSessionKey='checkpoint-steam-session-v2';
const steamLoginLifetime=10*60*1000;
let steamSession=null;

// Short-lived login data lives in localStorage so the return from Steam still works when the
// browser lands in another tab or window of the same app (for example an installed app window).
function steamStore(key,value) {
  try{
    if(value===undefined)return JSON.parse(localStorage.getItem(key)||sessionStorage.getItem(key)||'null');
    if(value===null){localStorage.removeItem(key);sessionStorage.removeItem(key);return null}
    localStorage.setItem(key,JSON.stringify(value));
  }catch{return null}
}

function steamBase64(bytes) {
  let text='';
  for(const byte of bytes)text+=String.fromCharCode(byte);
  return btoa(text).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}

function steamServerOrigin(raw) {
  try{
    const url=new URL(raw);
    const local=['localhost','127.0.0.1'].includes(url.hostname);
    if(url.protocol!=='https:'&&!(url.protocol==='http:'&&local))return '';
    return url.origin;
  }catch{return ''}
}

function isLocalApp() {
  return ['localhost','127.0.0.1'].includes(location.hostname);
}

// Local testing only: open the app on localhost with ?steam_server=http://localhost:8787.
function steamServerAddress() {
  if(isLocalApp()){
    const url=new URL(location.href);
    const override=url.searchParams.get('steam_server');
    if(override!==null){
      try{sessionStorage.setItem(steamLocalServerKey,override)}catch{}
      url.searchParams.delete('steam_server');
      history.replaceState(null,'',url.href);
    }
    let stored='';
    try{stored=sessionStorage.getItem(steamLocalServerKey)||''}catch{}
    if(stored)return steamServerOrigin(stored);
  }
  return steamServerOrigin(typeof checkpointSteamServer==='string'?checkpointSteamServer:'');
}

function steamAppAddress() {
  return location.origin+location.pathname;
}

async function beginSteamLogin() {
  const server=steamServerAddress();
  if(!server)throw Object.assign(Error('not_configured'),{code:'not_configured'});
  const verifier=steamBase64(crypto.getRandomValues(new Uint8Array(32)));
  const challenge=steamBase64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
  steamStore(steamPendingKey,{verifier,server,created:Date.now()});
  const url=new URL('/auth/steam/start',server);
  url.searchParams.set('challenge',challenge);
  url.searchParams.set('return_to',steamAppAddress());
  location.assign(url.href);
}

// Reads and removes the Steam result from the address bar. Returns null when there is none.
function takeSteamReturn() {
  const url=new URL(location.href);
  const code=url.searchParams.get('steam_code');
  const error=url.searchParams.get('steam_error');
  if(code===null&&error===null)return null;
  url.searchParams.delete('steam_code');
  url.searchParams.delete('steam_error');
  history.replaceState(null,'',url.href);
  const pending=steamStore(steamPendingKey);
  steamStore(steamPendingKey,null);
  if(error!==null)return {error:/^[a-z_]{1,32}$/.test(error)?error:'invalid'};
  if(!pending||typeof pending.verifier!=='string'||!steamServerOrigin(pending.server)||
     !(Date.now()-pending.created<steamLoginLifetime))return {error:'expired'};
  return {code,pending};
}

async function steamRequest(server,path,init={}) {
  let response;
  try{response=await fetch(new URL(path,server),{...init,cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(15000)})}
  catch{throw Object.assign(Error('steam_unavailable'),{code:'steam_unavailable'})}
  const data=await response.json().catch(()=>null);
  if(!response.ok){
    const code=typeof data?.error==='string'?data.error:'steam_unavailable';
    throw Object.assign(Error(code),{code,steamId:data?.steamId});
  }
  return data;
}

async function redeemSteamCode(code,pending) {
  const data=await steamRequest(pending.server,'/api/steam/token',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,verifier:pending.verifier}),
  });
  if(!/^\d{17}$/.test(data?.steamId)||typeof data?.token!=='string')throw Object.assign(Error('invalid'),{code:'invalid'});
  steamSession={server:pending.server,token:data.token,steamId:data.steamId,
    expiresAt:Date.now()+Math.max(0,(Number(data.expiresIn)||0)-30)*1000};
  steamStore(steamSessionKey,steamSession);
  return steamSession;
}

function steamSessionValid() {
  if(!steamSession){
    const stored=steamStore(steamSessionKey);
    if(stored&&typeof stored.token==='string'&&/^\d{17}$/.test(stored.steamId))steamSession=stored;
  }
  if(steamSession&&!(steamSession.expiresAt>Date.now())){forgetSteamSession();return false}
  return Boolean(steamSession&&steamSession.expiresAt>Date.now()&&steamSession.server===steamServerAddress());
}

async function loadSteamLibrary() {
  if(!steamSessionValid())throw Object.assign(Error('login_required'),{code:'login_required'});
  try{
    return await steamRequest(steamSession.server,'/api/steam/library',{headers:{Authorization:'Bearer '+steamSession.token}});
  }catch(error){
    if(error.code==='login_required')forgetSteamSession();
    throw error;
  }
}

function forgetSteamSession() {
  steamSession=null;
  steamStore(steamSessionKey,null);
}

// Translated message with the error code, so a screenshot tells which step failed.
function steamFailure(code) {
  const text=t(steamErrorMessage(code));
  return code&&code!=='not_configured'?text+' ('+code+')':text;
}

function steamErrorMessage(code) {
  return ({
    not_configured:'Logowanie Steam będzie dostępne po uruchomieniu serwera Checkpointa. Do tego czasu użyj importu JSON.',
    server_not_configured:'Serwer Steam Checkpointa nie jest jeszcze skonfigurowany.',
    cancelled:'Logowanie Steam zostało anulowane.',
    rate_limited:'Zbyt wiele prób. Odczekaj kilka minut i spróbuj ponownie.',
    library_private:'Zalogowano, ale Steam nie udostępnia listy gier. Ustaw „Szczegóły gier” jako publiczne w ustawieniach prywatności Steam i spróbuj ponownie.',
    login_required:'Sesja importu wygasła. Połącz Steam ponownie.',
    steam_key_rejected:'Steam odrzucił klucz API serwera Checkpointa. Właściciel aplikacji musi ustawić nowy klucz.',
    expired:'Logowanie Steam wygasło lub nie zostało potwierdzone. Spróbuj ponownie.',
    session:'Logowanie Steam wygasło lub nie zostało potwierdzone. Spróbuj ponownie.',
    invalid:'Logowanie Steam wygasło lub nie zostało potwierdzone. Spróbuj ponownie.',
    invalid_code:'Logowanie Steam wygasło lub nie zostało potwierdzone. Spróbuj ponownie.',
  })[code]||'Serwer Steam jest niedostępny.';
}
