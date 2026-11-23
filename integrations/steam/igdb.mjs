const twitchTokenUrl = 'https://id.twitch.tv/oauth2/token';
const igdbApi = 'https://api.igdb.com/v4/';
const platformIds = {
  Steam: [6], PC: [6], Xbox: [11, 12, 49, 169],
  PlayStation: [7, 8, 9, 48, 167], Nintendo: [130, 508, 41, 5, 21, 24, 37, 159],
};
const fields = 'id,name,slug,platforms,cover.image_id,artworks.image_id,screenshots.image_id,aggregated_rating,aggregated_rating_count,rating,rating_count';
const normalize = title => title.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f™®©]/g,'')
  .replace(/[^\p{L}\p{N}]+/gu,' ').trim();

export const igdbLimits = {
  igdbLookup: { max: 30, window: 60 },
  igdbShared: { max: 90, window: 60 },
};

export function igdbReady(env) {
  return Boolean(env.IGDB_CLIENT_ID && env.IGDB_CLIENT_SECRET);
}

function image(id, size) {
  return typeof id === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(id)
    ? 'https://images.igdb.com/igdb/image/upload/t_' + size + '/' + id + '.jpg' : '';
}

function rating(value, count) {
  return Number.isFinite(value) && value >= 0 && value <= 100 && Number.isSafeInteger(count) && count > 0
    ? { value: Math.round(value), count } : null;
}

function displayGame(game) {
  if (!Number.isSafeInteger(game?.id)) return null;
  return {
    id: game.id, slug: /^[a-z0-9-]+$/.test(game.slug ?? '') ? game.slug : '',
    cover: image(game.cover?.image_id,'cover_big_2x'),
    hero: image(game.artworks?.[0]?.image_id || game.screenshots?.[0]?.image_id,'1080p'),
    critics: rating(game.aggregated_rating,game.aggregated_rating_count),
    players: rating(game.rating,game.rating_count),
  };
}

export function createIgdbLookup(overLimit, requestUpstream = fetch) {
  let activeToken;
  let tokenRequest;

  function getToken(env) {
    if (activeToken?.clientId === env.IGDB_CLIENT_ID && activeToken.expires > Date.now()) {
      return Promise.resolve(activeToken.value);
    }
    if (tokenRequest?.clientId === env.IGDB_CLIENT_ID) return tokenRequest.promise;
    const promise = (async () => {
      const response = await requestUpstream(twitchTokenUrl, {
        method:'POST', body:new URLSearchParams({
          client_id:env.IGDB_CLIENT_ID, client_secret:env.IGDB_CLIENT_SECRET, grant_type:'client_credentials',
        }),
        signal:AbortSignal.timeout(5000),
      });
      const data = response.ok ? await response.json() : null;
      if (!data?.access_token || !Number.isFinite(data.expires_in)) throw Error('IGDB authentication failed');
      activeToken = { clientId:env.IGDB_CLIENT_ID, value:data.access_token, expires:Date.now() + (data.expires_in - 60)*1000 };
      return activeToken.value;
    })().finally(() => { if (tokenRequest?.promise === promise) tokenRequest = undefined; });
    tokenRequest = {clientId:env.IGDB_CLIENT_ID,promise};
    return promise;
  }

  async function query(env, resource, body) {
    const token = await getToken(env);
    const response = await requestUpstream(igdbApi + resource, {
      method:'POST', headers:{'Client-ID':env.IGDB_CLIENT_ID,Authorization:'Bearer '+token,Accept:'application/json'},
      body, signal:AbortSignal.timeout(5000),
    });
    if (response.status === 401 && activeToken?.value === token) activeToken = undefined;
    if (!response.ok) throw Error('IGDB lookup failed');
    const rows = await response.json();
    if (!Array.isArray(rows)) throw Error('Invalid IGDB response');
    return rows;
  }

  return async function lookup(request, env, reply, origin, ctx) {
    if (!origin) return reply({ error:'origin_not_allowed' },403);
    if (!igdbReady(env)) return reply({ error:'igdb_not_configured' },503);
    const url = new URL(request.url);
    const givenTitle = url.searchParams.get('title') || '';
    const title = normalize(givenTitle);
    const system = url.searchParams.get('system') || '';
    const steamId = url.searchParams.get('steamId') || '';
    if (givenTitle.length > 150 || !title || !Object.hasOwn(platformIds,system) ||
        (steamId && !/^\d{1,10}$/.test(steamId))) return reply({ error:'invalid_game' },400);

    const key = new URL('/cache/igdb/v1',url);
    key.search = new URLSearchParams({title:steamId?'':title,system:steamId?'Steam':system,steamId});
    const cache = globalThis.caches?.default;
    try {
      const cached = await cache?.match(key.href);
      if (cached) return reply(await cached.json());
      if (await overLimit(env,'igdbLookup',request) || await overLimit(env,'igdbShared')) {
        return reply({ error:'rate_limited' },429);
      }
      let match;
      if (steamId) {
        const rows = await query(env,'external_games',
          'fields game.' + fields.replaceAll(',',',game.') + '; where external_game_source = 1 & uid = "' + steamId + '"; limit 5;');
        const matches = [...new Map(rows.filter(row=>row.game?.id).map(row=>[row.game.id,row.game])).values()];
        if (matches.length === 1) match = matches[0];
      }
      if (!match) {
        const rows = await query(env,'games','search "' + title + '"; fields ' + fields + '; where platforms = (' +
          platformIds[system].join(',') + '); limit 30;');
        const matches = rows.filter(row => typeof row.name === 'string' && normalize(row.name) === title &&
          row.platforms?.some(platform => platformIds[system].includes(platform)));
        if (matches.length === 1) match = matches[0];
      }
      const result = { game:displayGame(match) };
      if (cache) ctx?.waitUntil(cache.put(key.href,Response.json(result,{
        headers:{'Cache-Control':result.game?'public, max-age=86400':'public, max-age=21600'},
      })).catch(()=>{}));
      return reply(result);
    } catch {
      return reply({ error:'igdb_unavailable' },502);
    }
  };
}

