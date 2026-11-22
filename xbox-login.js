// Xbox sign-in through the shared Checkpoint server (same Worker as Steam).
// Mirrors steam-login.js: PKCE verifier in sessionStorage for the trip to Microsoft,
// one-time code traded for a short-lived import token held in memory only.
const xboxPendingKey='checkpoint-xbox-login-v1';
const xboxLoginLifetime=10*60*1000;
let xboxSession=null;

async function beginXboxLogin() {
  const server=steamServerAddress();
  if(!server)throw Object.assign(Error('not_configured'),{code:'not_configured'});
  const verifier=steamBase64(crypto.getRandomValues(new Uint8Array(32)));
  const challenge=steamBase64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
  sessionStorage.setItem(xboxPendingKey,JSON.stringify({verifier,server,created:Date.now()}));
  const url=new URL('/auth/xbox/start',server);
  url.searchParams.set('challenge',challenge);
  url.searchParams.set('return_to',steamAppAddress());
  location.assign(url.href);
}

// Reads and removes the Xbox result from the address bar. Returns null when there is none.
function takeXboxReturn() {
  const url=new URL(location.href);
  const code=url.searchParams.get('xbox_code');
  const error=url.searchParams.get('xbox_error');
  if(code===null&&error===null)return null;
  url.searchParams.delete('xbox_code');
  url.searchParams.delete('xbox_error');
  history.replaceState(null,'',url.href);
  let pending=null;
  try{
    pending=JSON.parse(sessionStorage.getItem(xboxPendingKey)||'null');
    sessionStorage.removeItem(xboxPendingKey);
  }catch{}
  if(error!==null)return {error:/^[a-z_]{1,32}$/.test(error)?error:'invalid'};
  if(!pending||typeof pending.verifier!=='string'||!steamServerOrigin(pending.server)||
     !(Date.now()-pending.created<xboxLoginLifetime))return {error:'expired'};
  return {code,pending};
}

async function xboxRequest(server,path,init={}) {
  try{return await steamRequest(server,path,init)}
  catch(error){
    const code=error.code==='steam_unavailable'?'xbox_unavailable':error.code;
    throw Object.assign(Error(code),{code});
  }
}

async function redeemXboxCode(code,pending) {
  const data=await xboxRequest(pending.server,'/api/xbox/token',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,verifier:pending.verifier}),
  });
  if(typeof data?.token!=='string'||typeof data?.gamertag!=='string')throw Object.assign(Error('invalid'),{code:'invalid'});
  xboxSession={server:pending.server,token:data.token,gamertag:data.gamertag.slice(0,40),
    expiresAt:Date.now()+Math.max(0,(Number(data.expiresIn)||0)-30)*1000};
  return xboxSession;
}

function xboxSessionValid() {
  return Boolean(xboxSession&&xboxSession.expiresAt>Date.now()&&xboxSession.server===steamServerAddress());
}

async function loadXboxLibrary() {
  if(!xboxSessionValid())throw Object.assign(Error('login_required'),{code:'login_required'});
  try{
    return await xboxRequest(xboxSession.server,'/api/xbox/library',{headers:{Authorization:'Bearer '+xboxSession.token}});
  }catch(error){
    if(error.code==='login_required')xboxSession=null;
    throw error;
  }
}

function forgetXboxSession() {
  xboxSession=null;
}

function xboxErrorMessage(code) {
  return ({
    not_configured:'Logowanie Xbox będzie dostępne po uruchomieniu serwera Checkpointa.',
    server_not_configured:'Logowanie Xbox nie jest jeszcze skonfigurowane na serwerze Checkpointa.',
    cancelled:'Logowanie Xbox zostało anulowane.',
    rate_limited:'Zbyt wiele prób. Odczekaj kilka minut i spróbuj ponownie.',
    no_profile:'To konto Microsoft nie ma profilu Xbox. Zaloguj się na xbox.com, aby go utworzyć, i spróbuj ponownie.',
    child:'Konto dziecka wymaga zgody rodzica w ustawieniach rodziny Xbox.',
    adult_check:'Xbox wymaga dodatkowej weryfikacji konta. Zaloguj się na xbox.com i spróbuj ponownie.',
    region:'Xbox nie jest dostępny w kraju tego konta.',
    login_required:'Sesja importu wygasła. Połącz Xbox ponownie.',
    expired:'Logowanie Xbox wygasło lub nie zostało potwierdzone. Spróbuj ponownie.',
    session:'Logowanie Xbox wygasło lub nie zostało potwierdzone. Spróbuj ponownie.',
    invalid:'Logowanie Xbox wygasło lub nie zostało potwierdzone. Spróbuj ponownie.',
    invalid_code:'Logowanie Xbox wygasło lub nie zostało potwierdzone. Spróbuj ponownie.',
  })[code]||'Usługa Xbox jest chwilowo niedostępna. Spróbuj ponownie za chwilę.';
}
