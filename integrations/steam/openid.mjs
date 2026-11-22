const steamOpenId = 'https://steamcommunity.com/openid/login';
const protocol = 'http://specs.openid.net/auth/2.0';
const selector = protocol + '/identifier_select';
const stateCookie = '__Host-checkpoint-steam';
const statePattern = /^[a-f0-9]{32}$/;

function redirect(location, cookie) {
  return new Response(null, {
    status:303,
    headers:{ Location:location, 'Set-Cookie':cookie, 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer' },
  });
}

function cookie(state,maxAge) {
  return stateCookie+'='+state+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age='+maxAge;
}

export async function steamIdentity(request, env) {
  const url=new URL(request.url);
  const state=url.searchParams.get('state') || '';
  if(!env.APP_ORIGIN || !statePattern.test(state) || url.protocol!=='https:')return new Response(null,{status:400});
  const app=new URL('/checkpoint/',env.APP_ORIGIN);
  app.hash='connections';
  const callback=new URL('/auth/steam/callback',url.origin);
  callback.searchParams.set('state',state);

  if(url.pathname==='/auth/steam/start'){
    const authorize=new URL(steamOpenId);
    authorize.search=new URLSearchParams({
      'openid.ns':protocol,
      'openid.mode':'checkid_setup',
      'openid.return_to':callback.href,
      'openid.realm':url.origin+'/',
      'openid.identity':selector,
      'openid.claimed_id':selector,
    });
    return redirect(authorize.href,cookie(state,600));
  }

  const supplied=request.headers.get('Cookie')?.match(/(?:^|;\s*)__Host-checkpoint-steam=([a-f0-9]{32})(?=;|$)/)?.[1];
  if(supplied!==state)return new Response(null,{status:403});
  app.searchParams.set('steam_state',state);
  const fail=()=>{app.searchParams.set('steam_error','1');return redirect(app.href,cookie('',0))};
  const proof=url.searchParams;
  const mode=proof.get('openid.mode');
  if(mode!=='id_res')return fail();
  const signed=(proof.get('openid.signed')||'').split(',');
  if(!['op_endpoint','claimed_id','identity','return_to','response_nonce','assoc_handle'].every(field=>signed.includes(field)))return fail();
  const claimed=proof.get('openid.claimed_id') || '';
  const id=/^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/.exec(claimed)?.[1];
  const nonce=proof.get('openid.response_nonce') || '';
  const nonceTime=Date.parse(nonce.slice(0,20));
  if(!id || !Number.isFinite(nonceTime) || Math.abs(Date.now()-nonceTime)>600000 ||
      proof.get('openid.ns')!==protocol || proof.get('openid.identity')!==claimed ||
      proof.get('openid.op_endpoint')!==steamOpenId || proof.get('openid.return_to')!==callback.href)return fail();

  const params=new URLSearchParams([...proof].filter(([key])=>key.startsWith('openid.')));
  if(new Set(params.keys()).size!==[...params.keys()].length)return fail();
  params.set('openid.mode','check_authentication');
  try {
    const verification=await fetch(steamOpenId,{method:'POST',body:params,redirect:'error',signal:AbortSignal.timeout(10000)});
    if(!verification.ok || !/^is_valid:true\r?$/m.test(await verification.text()))return fail();
    app.searchParams.set('steam_id',id);
    return redirect(app.href,cookie('',0));
  }catch{return fail()}
}
