// Fake Microsoft and Xbox endpoints used by the tests. Nothing here talks to the network.
export const xuid = '2533274800000001';
export const gamertag = 'Afterglow Tester';
export const titles = [
  { titleId: '1915865634', name: 'Forza Horizon 5', type: 'Game', displayImage: 'http://store-images.s-microsoft.com/image/apps.1.jpg',
    titleHistory: { lastTimePlayed: '2026-11-01T18:00:00.000Z' },
    achievement: { currentAchievements: 12, totalAchievements: 197, currentGamerscore: 230, totalGamerscore: 5000 } },
  { titleId: '219630713', name: 'Halo Infinite', type: 'Game', achievement: { currentAchievements: 0, totalAchievements: 140 } },
  { titleId: '1', name: 'Netflix', type: 'App' },
  { titleId: '1915865634', name: 'Forza Horizon 5 duplicate', type: 'Game' },
];

export function installXboxFetch({ tokenOk = true, xstsError, library = { xuid, titles } } = {}) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url ?? input.href);
    calls.push({ url, init });
    if (url.href === 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token') {
      const body = new URLSearchParams(String(init.body));
      const ok = tokenOk && body.get('code') === 'ms-code' && body.get('client_secret') === 'test-secret' && body.get('code_verifier');
      return ok ? Response.json({ access_token: 'ms-access', token_type: 'Bearer' }) : Response.json({ error: 'invalid_grant' }, { status: 400 });
    }
    if (url.href === 'https://user.auth.xboxlive.com/user/authenticate') {
      const body = JSON.parse(init.body);
      if (body.Properties.RpsTicket !== 'd=ms-access') return new Response(null, { status: 400 });
      return Response.json({ Token: 'user-token', DisplayClaims: { xui: [{ uhs: 'hash' }] } });
    }
    if (url.href === 'https://xsts.auth.xboxlive.com/xsts/authorize') {
      if (xstsError) return Response.json({ XErr: xstsError }, { status: 401 });
      return Response.json({ Token: 'xsts-token', DisplayClaims: { xui: [{ uhs: 'hash', xid: xuid, gtg: gamertag }] } });
    }
    if (url.origin === 'https://titlehub.xboxlive.com') {
      if (init.headers?.Authorization !== 'XBL3.0 x=hash;xsts-token') return new Response(null, { status: 401 });
      return Response.json(library);
    }
    throw new TypeError('Unexpected network call: ' + url.href);
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}
