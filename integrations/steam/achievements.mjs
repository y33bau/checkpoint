// Achievement lists for the shared Checkpoint server.
// Steam: GET /api/steam/achievements?appids=1,2&lang=pl with the Steam import token.
// For each game the Worker asks Steam for the player's progress (GetPlayerAchievements)
// and the game's achievement icons (GetSchemaForGame). Ten games per request keeps
// every call well under the Workers subrequest limit.
// Xbox lists are collected during the Xbox sign-in (see xbox.mjs), because Xbox tokens are not kept.

const playerEndpoint = 'https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/';
const schemaEndpoint = 'https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/';
const userAgent = 'Checkpoint-Steam/2 (+https://y33bau.github.io/checkpoint/)';
export const maxAppsPerRequest = 10;
export const maxAchievements = 500;

export const achievementLimits = {
  steam_achievements: { max: 40, window: 600 },
};

export const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';

// Achievement icons come from Steam or Xbox image hosts only.
export function achievementIcon(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'http:') url.protocol = 'https:';
    const host = url.hostname;
    const allowed = ['steamstatic.com', 'akamaihd.net', 'steampowered.com', 'xboxlive.com', 's-microsoft.com']
      .some(domain => host === domain || host.endsWith('.' + domain));
    return url.protocol === 'https:' && allowed && url.href.length <= 600 ? url.href : '';
  } catch {
    return '';
  }
}

// One shape for every platform: { id, name, description?, unlocked, unlockedAt?, hidden?, icon?, gamerscore? }.
export function achievementRow(row) {
  const name = text(row.name, 200);
  if (!name) return null;
  const entry = {
    id: text(row.id, 128) || name,
    name,
    description: row.hidden && !row.unlocked ? '' : text(row.description, 400),
    unlocked: Boolean(row.unlocked),
    unlockedAt: row.unlocked && Number.isFinite(row.unlockedAt) && row.unlockedAt > 0 ? row.unlockedAt : undefined,
    hidden: row.hidden ? true : undefined,
    icon: achievementIcon(row.icon),
    gamerscore: Number.isInteger(row.gamerscore) && row.gamerscore >= 0 && row.gamerscore <= 10000 ? row.gamerscore : undefined,
  };
  return Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined && value !== ''));
}

const steamLanguage = lang => lang === 'en' ? 'english' : 'polish';

async function steamJson(endpoint, params) {
  const url = new URL(endpoint);
  url.search = new URLSearchParams({ ...params, format: 'json' });
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': userAgent },
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, ok: response.ok, data };
}

// Merges the player's progress with the game schema (icons, hidden flags).
export function steamAchievementRows(player, schema) {
  const icons = new Map();
  for (const item of Array.isArray(schema) ? schema : []) {
    if (typeof item?.name === 'string') icons.set(item.name, item);
  }
  const rows = [];
  for (const item of Array.isArray(player) ? player : []) {
    if (typeof item?.apiname !== 'string') continue;
    const info = icons.get(item.apiname) ?? {};
    const row = achievementRow({
      id: item.apiname,
      name: item.name || info.displayName || item.apiname,
      description: item.description || info.description,
      unlocked: item.achieved === 1,
      unlockedAt: Number.isInteger(item.unlocktime) ? item.unlocktime * 1000 : undefined,
      hidden: info.hidden === 1,
      icon: info.icon,
    });
    if (row) rows.push(row);
    if (rows.length >= maxAchievements) break;
  }
  return rows;
}

async function steamGameAchievements(env, steamId, appid, lang) {
  const l = steamLanguage(lang);
  const [player, schema] = await Promise.all([
    steamJson(playerEndpoint, { key: env.STEAM_WEB_API_KEY, steamid: steamId, appid: String(appid), l }),
    steamJson(schemaEndpoint, { key: env.STEAM_WEB_API_KEY, appid: String(appid), l }).catch(() => null),
  ]);
  const stats = player.data?.playerstats;
  if (player.status === 401) return { appid, error: 'steam_key_rejected' };
  if (player.status === 403 || /not public/i.test(stats?.error ?? '')) return { appid, error: 'achievements_private' };
  if (!player.ok || stats?.success === false) {
    // Steam answers 400 "Requested app has no stats" for games without achievements.
    return player.status === 400 || /no stats/i.test(stats?.error ?? '') ? { appid, achievements: [] } : { appid, error: 'steam_unavailable' };
  }
  const achievements = steamAchievementRows(stats?.achievements, schema?.data?.game?.availableGameStats?.achievements);
  return { appid, achievements };
}

export function parseAppIds(raw) {
  const ids = String(raw || '').split(',').filter(Boolean);
  if (!ids.length || ids.length > maxAppsPerRequest || !ids.every(id => /^\d{1,10}$/.test(id))) return null;
  return [...new Set(ids.map(Number))].filter(id => id > 0);
}

export async function steamAchievements(env, steamId, appids, lang) {
  const results = await Promise.all(appids.map(appid =>
    steamGameAchievements(env, steamId, appid, lang).catch(() => ({ appid, error: 'steam_unavailable' }))));
  return results;
}
