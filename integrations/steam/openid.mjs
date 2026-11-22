// Steam OpenID 2.0: identity only. The library is read separately with the Web API.
export const steamOpenId = 'https://steamcommunity.com/openid/login';
const protocol = 'http://specs.openid.net/auth/2.0';
const selector = protocol + '/identifier_select';
const requiredSigned = ['op_endpoint', 'claimed_id', 'identity', 'return_to', 'response_nonce', 'assoc_handle'];
export const nonceWindow = 10 * 60 * 1000;

export function steamAuthorizeUrl(callback) {
  const callbackUrl = new URL(callback);
  const authorize = new URL(steamOpenId);
  authorize.search = new URLSearchParams({
    'openid.ns': protocol,
    'openid.mode': 'checkid_setup',
    'openid.return_to': callbackUrl.href,
    'openid.realm': callbackUrl.origin + '/',
    'openid.identity': selector,
    'openid.claimed_id': selector,
  });
  return authorize.href;
}

// Returns { steamId, nonce } after Steam itself confirms the signature, otherwise
// { error } with 'cancelled' or 'invalid'.
export async function verifySteamAssertion(query, callback, { fetcher = fetch, now = Date.now() } = {}) {
  const mode = query.get('openid.mode');
  if (mode === 'cancel') return { error: 'cancelled' };
  if (mode !== 'id_res') return { error: 'invalid' };
  const keys = [...query.keys()].filter(key => key.startsWith('openid.'));
  if (new Set(keys).size !== keys.length) return { error: 'invalid' };
  const signed = (query.get('openid.signed') || '').split(',');
  if (!requiredSigned.every(field => signed.includes(field))) return { error: 'invalid' };
  const claimed = query.get('openid.claimed_id') || '';
  const steamId = /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/.exec(claimed)?.[1];
  const nonce = query.get('openid.response_nonce') || '';
  const nonceTime = Date.parse(nonce.slice(0, 20));
  if (!steamId || nonce.length > 256 || !Number.isFinite(nonceTime) || Math.abs(now - nonceTime) > nonceWindow ||
      query.get('openid.ns') !== protocol || query.get('openid.identity') !== claimed ||
      query.get('openid.op_endpoint') !== steamOpenId || query.get('openid.return_to') !== callback) {
    return { error: 'invalid' };
  }
  const params = new URLSearchParams(keys.map(key => [key, query.get(key)]));
  params.set('openid.mode', 'check_authentication');
  try {
    const verification = await fetcher(steamOpenId, {
      method: 'POST', body: params, redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    if (!verification.ok || !/^is_valid:true\r?$/m.test(await verification.text())) return { error: 'invalid' };
  } catch {
    return { error: 'invalid' };
  }
  return { steamId, nonce };
}
