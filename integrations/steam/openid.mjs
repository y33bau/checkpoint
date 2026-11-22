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
  if (mode !== 'id_res') return { error: 'invalid', reason: 'mode ' + mode };
  const keys = [...query.keys()].filter(key => key.startsWith('openid.'));
  if (new Set(keys).size !== keys.length) return { error: 'invalid', reason: 'duplicate_keys' };
  const signed = (query.get('openid.signed') || '').split(',');
  if (!requiredSigned.every(field => signed.includes(field))) return { error: 'invalid', reason: 'signed_fields' };
  const claimed = query.get('openid.claimed_id') || '';
  const steamId = /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/.exec(claimed)?.[1];
  const nonce = query.get('openid.response_nonce') || '';
  const nonceTime = Date.parse(nonce.slice(0, 20));
  const failed = !steamId ? 'claimed_id'
    : nonce.length > 256 || !Number.isFinite(nonceTime) ? 'nonce_format'
    : Math.abs(now - nonceTime) > nonceWindow ? 'nonce_time'
    : query.get('openid.ns') !== protocol ? 'ns'
    : query.get('openid.identity') !== claimed ? 'identity'
    : query.get('openid.op_endpoint') !== steamOpenId ? 'op_endpoint'
    : query.get('openid.return_to') !== callback ? 'return_to'
    : null;
  if (failed) return { error: 'invalid', reason: failed };
  const params = new URLSearchParams(keys.map(key => [key, query.get(key)]));
  params.set('openid.mode', 'check_authentication');
  try {
    const verification = await fetcher(steamOpenId, {
      method: 'POST', body: params, redirect: 'manual', signal: AbortSignal.timeout(10000),
    });
    const text = await verification.text();
    if (!verification.ok || !/^is_valid:true\r?$/m.test(text)) {
      return { error: 'invalid', reason: 'check_authentication ' + verification.status + ' ' + text.slice(0, 120).replace(/\s+/g, ' ') };
    }
  } catch (error) {
    return { error: 'invalid', reason: 'check_authentication_fetch ' + (error?.name || '') + ' ' + (error?.message || '') };
  }
  return { steamId, nonce };
}
