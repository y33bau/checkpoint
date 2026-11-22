// Fake Steam endpoints used by the tests. Nothing here talks to the network.
export const steamId = '76561197960287930';
export const games = [
  { appid: 620, name: 'Portal 2', playtime_forever: 1312, rtime_last_played: 1700000000, img_icon_url: 'x' },
  { appid: 1145360, name: 'Hades', playtime_forever: 0 },
];

export function steamAssertion(returnTo, { id = steamId, nonce = new Date().toISOString().slice(0, 19) + 'Zabc123', mode = 'id_res' } = {}) {
  const claimed = 'https://steamcommunity.com/openid/id/' + id;
  return new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': mode,
    'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
    'openid.claimed_id': claimed,
    'openid.identity': claimed,
    'openid.return_to': returnTo,
    'openid.response_nonce': nonce,
    'openid.assoc_handle': '1234567890',
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'c2lnbmF0dXJl',
  });
}

export function installSteamFetch({ valid = true, library = { response: { game_count: games.length, games } } } = {}) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url ?? input.href);
    calls.push({ url, init });
    // Like the Cloudflare Workers runtime, which rejects redirect: 'error'.
    if (init.redirect !== undefined && init.redirect !== 'follow' && init.redirect !== 'manual') {
      throw new TypeError('Invalid redirect value, must be one of "follow" or "manual"');
    }
    if (url.href === 'https://steamcommunity.com/openid/login') {
      const body = new URLSearchParams(String(init.body));
      const ok = valid && body.get('openid.mode') === 'check_authentication';
      return new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:' + ok + '\n');
    }
    if (url.origin === 'https://api.steampowered.com') return Response.json(library);
    throw new TypeError('Unexpected network call: ' + url.href);
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}
