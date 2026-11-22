import { steamIdentity } from './openid.mjs';

const libraryEndpoint = 'https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/';

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const headers = { 'Cache-Control': 'no-store', Vary: 'Origin' };
    if (origin === env.APP_ORIGIN) headers['Access-Control-Allow-Origin'] = origin;
    const reply = (body, status = 200) => Response.json(body, { status, headers });

    if (request.method !== 'GET') return reply({ error: 'method_not_allowed' }, 405);
    const pathname=new URL(request.url).pathname;
    if(pathname==='/auth/steam/status')return reply({steamOpenId:true});
    if(pathname==='/auth/steam/start'||pathname==='/auth/steam/callback')return steamIdentity(request,env);
    if (!env.STEAM_WEB_API_KEY || !env.STEAM_ID64 || !env.APP_ORIGIN) {
      return reply({ error: 'server_not_configured' }, 503);
    }
    const steamid = new URL(request.url).searchParams.get('steamid');
    if (steamid !== env.STEAM_ID64) return reply({ error: 'profile_not_configured' }, 403);

    const url = new URL(libraryEndpoint);
    url.search = new URLSearchParams({
      key: env.STEAM_WEB_API_KEY,
      steamid,
      include_appinfo: '1',
      include_played_free_games: '1',
    });
    try {
      const upstream = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!upstream.ok) return reply({ error: 'steam_unavailable' }, 502);
      const { response } = await upstream.json();
      if (Array.isArray(response?.games)) return reply({ games: response.games });
      if (response?.game_count === 0) return reply({ games: [] });
      return reply({ error: 'library_unavailable' }, 403);
    } catch {
      return reply({ error: 'steam_unavailable' }, 502);
    }
  },
};
