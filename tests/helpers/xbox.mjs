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

export const achievementLists = {
  1915865634: [
    { id: '1', name: 'Welcome to Mexico', description: 'Complete the opening drive', lockedDescription: 'Complete the opening drive',
      progressState: 'Achieved', progression: { timeUnlocked: '2026-10-01T10:00:00.000Z' }, isSecret: false,
      mediaAssets: [{ name: 'icon', type: 'Icon', url: 'https://images-eds-ssl.xboxlive.com/image?url=abc' }],
      rewards: [{ value: '10', type: 'Gamerscore' }] },
    { id: '2', name: 'Secret road', description: 'Spoiler text', lockedDescription: 'Secret achievement', progressState: 'NotStarted',
      progression: { timeUnlocked: '0001-01-01T00:00:00.0000000Z' }, isSecret: true, rewards: [{ value: '20', type: 'Gamerscore' }] },
  ],
};

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
    if (url.origin === 'https://achievements.xboxlive.com') {
      if (init.headers?.Authorization !== 'XBL3.0 x=hash;xsts-token') return new Response(null, { status: 401 });
      const list = achievementLists[url.searchParams.get('titleId')];
      return list ? Response.json({ achievements: list, pagingInfo: { continuationToken: null } }) : new Response(null, { status: 404 });
    }
    if (url.origin === 'https://titlehub.xboxlive.com') {
      if (init.headers?.Authorization !== 'XBL3.0 x=hash;xsts-token') return new Response(null, { status: 401 });
      return Response.json(library);
    }
    throw new TypeError('Unexpected network call: ' + url.href);
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}
