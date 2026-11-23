import { durationMinutes, playedGames } from './psn-history.mjs';

const pageLimit = 30;

function unwrap(data) {
  if (data?.code && data.code >= 400) throw Error('Upstream rejected the request');
  return data?.content ?? data;
}

async function xboxPages(key, path) {
  const rows = [];
  const seen = new Set();
  let continuation;
  for (let index = 0; index < pageLimit; index++) {
    const url = new URL(path, 'https://api.xbl.io');
    if (continuation) url.searchParams.set('continuationToken', continuation);
    const response = await fetch(url, {
      headers: { 'X-Authorization': key },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw Error('Xbox API returned ' + response.status);
    const body = unwrap(await response.json());
    const page = Array.isArray(body) ? body : body?.titles ?? body?.titleHistory?.titles;
    if (!Array.isArray(page)) throw Error('Xbox title list unavailable');
    rows.push(...page);
    continuation = body?.pagingInfo?.continuationToken ?? body?.continuationToken ?? body?.titleHistory?.pagingInfo?.continuationToken;
    if (!continuation) return rows;
    if (seen.has(continuation)) throw Error('Xbox repeated a page');
    seen.add(continuation);
  }
  throw Error('Xbox pagination limit reached');
}

function xboxGame(item) {
  const achievement = item.achievement ?? item.achievementsSummary;
  return {
    id: item.titleId == null ? '' : String(item.titleId),
    title: item.name ?? item.titleName,
    cover: item.displayImage ?? item.imageUrl,
    minutes: item.minutesPlayed ?? item.playtimeMinutes ?? item.stats?.minutesPlayed,
    lastPlayed: item.titleHistory?.lastTimePlayed ?? item.lastTimePlayed ?? item.lastPlayed,
    unlocked: achievement?.currentAchievements,
    total: achievement?.totalAchievements,
    gamerscore: achievement?.currentGamerscore,
    gamerscoreTotal: achievement?.totalGamerscore,
    activity: 'played',
  };
}

export async function xboxLibrary(env) {
  if (!env.OPENXBL_API_KEY) throw Error('Xbox credentials missing');
  const [history, achievements] = await Promise.allSettled([
    xboxPages(env.OPENXBL_API_KEY, '/v2/titles'),
    xboxPages(env.OPENXBL_API_KEY, '/v2/achievements'),
  ]);
  if (history.status === 'rejected' && achievements.status === 'rejected') throw Error('Xbox library unavailable');
  const entries = new Map();
  for (const result of [history, achievements]) {
    if (result.status !== 'fulfilled') continue;
    for (const row of result.value) {
      const item = xboxGame(row);
      if (!item.title) continue;
      const id = item.id || item.title.toLowerCase();
      entries.set(id, { ...entries.get(id), ...Object.fromEntries(Object.entries(item).filter(([, value]) => value != null)) });
    }
  }
  return { games: [...entries.values()], partial: history.status === 'rejected' || achievements.status === 'rejected' };
}

async function purchasedGames(api, credentials) {
  const games = [];
  const seen = new Set();
  for (let index = 0; index < pageLimit; index++) {
    const result = await api.getPurchasedGames(credentials, {
      platform: ['ps4', 'ps5'], isActive: true, size: 48, start: index * 48,
    });
    const page = result?.data?.purchasedTitlesRetrieve?.games;
    if (!Array.isArray(page)) throw Error('PlayStation purchase list unavailable');
    if (!page.length) return games;
    const key = page.map(row => row.entitlementId || row.titleId).join(',');
    if (seen.has(key)) throw Error('PlayStation repeated purchase page');
    seen.add(key);
    games.push(...page);
    if (page.length < 48) return games;
  }
  throw Error('PlayStation purchase pagination limit reached');
}

let authorization;
let authorizeJob;
async function authorizePSN(api, env) {
  if (authorization && Date.now() < authorization.expiresAt) return authorization.tokens;
  if (!authorizeJob) authorizeJob = (async () => {
    let tokens;
    if (authorization?.tokens.refreshToken) {
      try { tokens = await api.exchangeRefreshTokenForAuthTokens(authorization.tokens.refreshToken); }
      catch { authorization = undefined; }
    }
    if (!tokens) {
      if (!env.PSN_NPSSO) throw Error('PlayStation credentials missing');
      const code = await api.exchangeNpssoForAccessCode(env.PSN_NPSSO);
      tokens = await api.exchangeAccessCodeForAuthTokens(code);
    }
    authorization = { tokens, expiresAt: Date.now() + (tokens.expiresIn || 1800) * 1000 - 30000 };
    return tokens;
  })().finally(() => { authorizeJob = undefined; });
  return authorizeJob;
}

export async function psnLibrary(env,loadApi=()=>import('psn-api')) {
  if (!env.PSN_NPSSO) throw Error('PlayStation credentials missing');
  const api = await loadApi();
  const credentials = await authorizePSN(api, env);
  const [purchased, played] = await Promise.allSettled([
    purchasedGames(api, credentials),
    playedGames(api, credentials, 'me', pageLimit).then(result => {
      if (result.partial) throw Error('PlayStation activity pagination limit reached');
      return result.games;
    }),
  ]);
  if (purchased.status === 'rejected' && played.status === 'rejected') throw Error('PlayStation library unavailable');
  const activity = played.status === 'fulfilled' ? played.value : [];
  const collection = purchased.status === 'fulfilled' ? purchased.value : [];
  const entries = new Map();
  for (const item of collection) {
    const id = String(item.conceptId ?? item.titleId ?? item.productId ?? item.name);
    if (!item.name) continue;
    entries.set(id, { id, title: item.name, cover: item.image?.url, activity: 'entitled' });
  }
  for (const item of activity) {
    const id = String(item.concept?.id ?? item.titleId ?? item.name);
    const existing = entries.get(id);
    const title = existing?.title ?? item.concept?.name ?? item.localizedName ?? item.name;
    if (!title) continue;
    const minutes = durationMinutes(item.playDuration);
    entries.set(id, {
      ...existing, id, title,
      cover: existing?.cover ?? item.localizedImageUrl ?? item.imageUrl,
      minutes: minutes == null ? existing?.minutes : Math.max(minutes, existing?.minutes ?? 0),
      lastPlayed: [item.lastPlayedDateTime, existing?.lastPlayed].filter(Boolean).sort().at(-1),
      activity: existing?.activity ?? 'played',
    });
  }
  return { games: [...entries.values()], partial: purchased.status === 'rejected' || played.status === 'rejected' };
}

export async function xboxTitleAchievements(env, titleId) {
  if (!env.OPENXBL_API_KEY) throw Error('Xbox credentials missing');
  const achievements = [];
  const seen = new Set();
  let continuation;
  for (let index = 0; index < pageLimit; index++) {
    const url = new URL('/v2/achievements/title/' + titleId, 'https://api.xbl.io');
    if (continuation) url.searchParams.set('continuationToken', continuation);
    const response = await fetch(url, { headers: { 'X-Authorization': env.OPENXBL_API_KEY }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw Error('Achievements unavailable');
    const body = unwrap(await response.json());
    const page = body?.achievements;
    if (!Array.isArray(page)) throw Error('Achievement list unavailable');
    achievements.push(...page.filter(item => typeof item?.name === 'string').map(item => ({
      name: item.name,
      unlocked: item.progressState === 'Achieved',
      description: item.progressState === 'Achieved' ? item.description : item.lockedDescription,
      earnedAt: item.progressState === 'Achieved' ? item.progression?.timeUnlocked : undefined,
    })));
    continuation = body?.pagingInfo?.continuationToken;
    if (!continuation) return achievements;
    if (seen.has(continuation)) throw Error('Xbox repeated achievement page');
    seen.add(continuation);
  }
  throw Error('Achievement pagination limit reached');
}
