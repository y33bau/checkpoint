// Shared Checkpoint Steam server.
// Flow: /auth/steam/start (PKCE challenge) -> Steam OpenID -> /auth/steam/callback
// -> app gets a one-time code -> POST /api/steam/token (code + verifier)
// -> short-lived import token -> GET /api/steam/library.
// Xbox sign-in (/auth/xbox/*, /api/xbox/*) lives in xbox.mjs.
// Secrets: STEAM_WEB_API_KEY, XBOX_CLIENT_SECRET. Vars: APP_URLS, XBOX_CLIENT_ID. Binding: DB (D1).
import { nonceWindow, steamAuthorizeUrl, verifySteamAssertion } from './openid.mjs';
import { createXbox, xboxLimits, xboxReady, xboxTables } from './xbox.mjs';

const libraryEndpoint = 'https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/';
const stateCookie = '__Host-checkpoint-steam';
const challengePattern = /^[A-Za-z0-9_-]{43}$/;
const secretPattern = /^[A-Za-z0-9_-]{43,128}$/;
const statePattern = /^[A-Za-z0-9_-]{43}$/;

export const lifetimes = { state: 10 * 60, code: 2 * 60, token: 10 * 60 };
export const limits = {
  start: { max: 10, window: 600 },
  token: { max: 20, window: 600 },
  library: { max: 20, window: 600 },
  ...xboxLimits,
};

const encoder = new TextEncoder();
function base64url(bytes) {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
export const randomSecret = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
export async function sha256(text) {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text))));
}

function isLocalHost(url) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

// APP_URLS: comma separated app addresses (origin + path) allowed to receive logins.
export function appUrls(env) {
  return String(env.APP_URLS || '').split(',').map(value => value.trim()).filter(Boolean).flatMap(value => {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalHost(url))) return [];
      if (url.username || url.password || url.search || url.hash) return [];
      return [url.href];
    } catch {
      return [];
    }
  });
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

async function clientKey(request) {
  return sha256(request.headers.get('CF-Connecting-IP') || 'unknown');
}

async function overLimit(env, action, request) {
  const rule = limits[action];
  const now = nowSeconds();
  const bucket = action + ':' + await clientKey(request);
  const row = await env.DB.prepare(
    'INSERT INTO rate_limits (bucket, count, expires_at) VALUES (?1, 1, ?2) ' +
    'ON CONFLICT(bucket) DO UPDATE SET ' +
    'count = CASE WHEN rate_limits.expires_at <= ?3 THEN 1 ELSE rate_limits.count + 1 END, ' +
    'expires_at = CASE WHEN rate_limits.expires_at <= ?3 THEN excluded.expires_at ELSE rate_limits.expires_at END ' +
    'RETURNING count',
  ).bind(bucket, now + rule.window, now).first();
  return (row?.count ?? 0) > rule.max;
}

async function cleanup(env) {
  const now = nowSeconds();
  await env.DB.batch(['login_states', 'used_nonces', 'login_codes', 'import_tokens', 'rate_limits', ...xboxTables]
    .map(table => env.DB.prepare('DELETE FROM ' + table + ' WHERE expires_at <= ?1').bind(now)));
}

const baseHeaders = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };

function redirect(location, cookie) {
  const headers = { ...baseHeaders, Location: location };
  if (cookie) headers['Set-Cookie'] = cookie;
  return new Response(null, { status: 303, headers });
}

function stateCookieHeader(value, maxAge) {
  // __Host- requires Secure; browsers also accept Secure cookies on http://localhost.
  return stateCookie + '=' + value + '; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=' + maxAge;
}

function appRedirect(returnUrl, params, clearCookie = true) {
  const target = new URL(returnUrl);
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
  target.hash = 'connections';
  return redirect(target.href, clearCookie ? stateCookieHeader('', 0) : null);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = new Set(appUrls(env).map(url => new URL(url).origin));
  const headers = { ...baseHeaders, Vary: 'Origin' };
  if (origin && allowed.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    headers['Access-Control-Max-Age'] = '600';
  }
  return { headers, origin: headers['Access-Control-Allow-Origin'] || null };
}

async function start(request, env, url) {
  const challenge = url.searchParams.get('challenge') || '';
  const returnTo = url.searchParams.get('return_to') || '';
  if (!appUrls(env).includes(returnTo)) return new Response('Unknown application address.', { status: 400, headers: baseHeaders });
  if (!challengePattern.test(challenge)) return appRedirect(returnTo, { steam_error: 'invalid' }, false);
  if (await overLimit(env, 'start', request)) return appRedirect(returnTo, { steam_error: 'rate_limited' }, false);
  const state = randomSecret();
  await env.DB.prepare('INSERT INTO login_states (state, challenge, return_url, expires_at) VALUES (?1, ?2, ?3, ?4)')
    .bind(state, challenge, returnTo, nowSeconds() + lifetimes.state).run();
  const callback = new URL('/auth/steam/callback', url.origin);
  callback.searchParams.set('state', state);
  return redirect(steamAuthorizeUrl(callback.href), stateCookieHeader(state, lifetimes.state));
}

async function callback(request, env, url) {
  const state = url.searchParams.get('state') || '';
  const fallback = appUrls(env)[0];
  const stored = statePattern.test(state)
    ? await env.DB.prepare('DELETE FROM login_states WHERE state = ?1 RETURNING challenge, return_url, expires_at').bind(state).first()
    : null;
  if (!stored || stored.expires_at <= nowSeconds()) {
    return fallback ? appRedirect(fallback, { steam_error: 'expired' }) : new Response(null, { status: 400, headers: baseHeaders });
  }
  const returnUrl = stored.return_url;
  const cookie = request.headers.get('Cookie')?.match(/(?:^|;\s*)__Host-checkpoint-steam=([A-Za-z0-9_-]{43})(?=;|$)/)?.[1];
  if (cookie !== state) return appRedirect(returnUrl, { steam_error: 'session' });

  const callbackUrl = new URL('/auth/steam/callback', url.origin);
  callbackUrl.searchParams.set('state', state);
  const result = await verifySteamAssertion(url.searchParams, callbackUrl.href);
  if (result.error) {
    if (result.reason) console.error('Steam assertion rejected:', result.reason);
    return appRedirect(returnUrl, { steam_error: result.error });
  }

  // A Steam assertion is accepted once.
  const nonceHash = await sha256(result.nonce);
  const fresh = await env.DB.prepare('INSERT INTO used_nonces (nonce, expires_at) VALUES (?1, ?2) ON CONFLICT(nonce) DO NOTHING RETURNING nonce')
    .bind(nonceHash, nowSeconds() + Math.ceil(nonceWindow / 1000) * 2).first();
  if (!fresh) {
    console.error('Steam assertion rejected: nonce already used');
    return appRedirect(returnUrl, { steam_error: 'invalid' });
  }

  const code = randomSecret();
  await env.DB.prepare('INSERT INTO login_codes (code_hash, steam_id, challenge, origin, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(await sha256(code), result.steamId, stored.challenge, new URL(returnUrl).origin, nowSeconds() + lifetimes.code).run();
  return appRedirect(returnUrl, { steam_code: code });
}

async function exchange(request, env, reply, origin) {
  if (!origin) return reply({ error: 'origin_not_allowed' }, 403);
  if (await overLimit(env, 'token', request)) return reply({ error: 'rate_limited' }, 429);
  let body;
  try {
    if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) throw Error();
    body = await request.json();
  } catch {
    return reply({ error: 'invalid_request' }, 400);
  }
  const code = typeof body?.code === 'string' ? body.code : '';
  const verifier = typeof body?.verifier === 'string' ? body.verifier : '';
  if (!secretPattern.test(code) || !secretPattern.test(verifier)) return reply({ error: 'invalid_request' }, 400);
  const stored = await env.DB.prepare('DELETE FROM login_codes WHERE code_hash = ?1 RETURNING steam_id, challenge, origin, expires_at')
    .bind(await sha256(code)).first();
  if (!stored || stored.expires_at <= nowSeconds() || stored.origin !== origin || stored.challenge !== await sha256(verifier)) {
    return reply({ error: 'invalid_code' }, 400);
  }
  const token = randomSecret();
  await env.DB.prepare('INSERT INTO import_tokens (token_hash, steam_id, origin, expires_at) VALUES (?1, ?2, ?3, ?4)')
    .bind(await sha256(token), stored.steam_id, origin, nowSeconds() + lifetimes.token).run();
  return reply({ token, steamId: stored.steam_id, expiresIn: lifetimes.token });
}

async function library(request, env, reply, origin) {
  if (!origin) return reply({ error: 'origin_not_allowed' }, 403);
  if (!env.STEAM_WEB_API_KEY) return reply({ error: 'server_not_configured' }, 503);
  if (await overLimit(env, 'library', request)) return reply({ error: 'rate_limited' }, 429);
  const token = /^Bearer ([A-Za-z0-9_-]{43,128})$/.exec(request.headers.get('Authorization') || '')?.[1];
  const stored = token
    ? await env.DB.prepare('SELECT steam_id, origin, expires_at FROM import_tokens WHERE token_hash = ?1').bind(await sha256(token)).first()
    : null;
  if (!stored || stored.expires_at <= nowSeconds() || stored.origin !== origin) return reply({ error: 'login_required' }, 401);

  const upstreamUrl = new URL(libraryEndpoint);
  upstreamUrl.search = new URLSearchParams({
    key: env.STEAM_WEB_API_KEY,
    steamid: stored.steam_id,
    include_appinfo: '1',
    include_played_free_games: '1',
    format: 'json',
  });
  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { Accept: 'application/json', 'User-Agent': 'Checkpoint-Steam/2 (+https://y33bau.github.io/checkpoint/)' },
      signal: AbortSignal.timeout(10000),
    });
    if (upstream.status === 401 || upstream.status === 403) {
      console.error('GetOwnedGames rejected the API key', upstream.status);
      return reply({ error: 'steam_key_rejected' }, 502);
    }
    if (!upstream.ok) {
      console.error('GetOwnedGames failed', upstream.status);
      return reply({ error: 'steam_unavailable' }, 502);
    }
    const { response } = await upstream.json();
    const games = Array.isArray(response?.games) ? response.games : response?.game_count === 0 ? [] : null;
    if (!games) return reply({ error: 'library_private', steamId: stored.steam_id }, 403);
    return reply({
      steamId: stored.steam_id,
      games: games.filter(game => Number.isInteger(game?.appid) && typeof game?.name === 'string').map(game => ({
        appid: game.appid,
        name: game.name,
        playtime_forever: Number.isFinite(game.playtime_forever) ? game.playtime_forever : 0,
        ...(Number.isFinite(game.rtime_last_played) ? { rtime_last_played: game.rtime_last_played } : {}),
      })),
    });
  } catch (error) {
    console.error('GetOwnedGames request error', error?.name || 'unknown');
    return reply({ error: 'steam_unavailable' }, 502);
  }
}

const xbox = createXbox({ appUrls, overLimit, sha256, randomSecret, nowSeconds, baseHeaders, redirect, lifetimes });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!env.DB || !appUrls(env).length) {
      return Response.json({ error: 'server_not_configured' }, { status: 503, headers: baseHeaders });
    }
    if (url.pathname.startsWith('/auth/steam/')) {
      if (request.method !== 'GET') return new Response(null, { status: 405, headers: baseHeaders });
      if (url.protocol !== 'https:' && !isLocalHost(url)) return new Response(null, { status: 400, headers: baseHeaders });
      if (url.pathname === '/auth/steam/start') {
        ctx?.waitUntil?.(cleanup(env).catch(() => {}));
        return start(request, env, url);
      }
      if (url.pathname === '/auth/steam/callback') return callback(request, env, url);
      return new Response(null, { status: 404, headers: baseHeaders });
    }
    if (url.pathname.startsWith('/auth/xbox/')) {
      if (request.method !== 'GET') return new Response(null, { status: 405, headers: baseHeaders });
      if (url.protocol !== 'https:' && !isLocalHost(url)) return new Response(null, { status: 400, headers: baseHeaders });
      if (url.pathname === '/auth/xbox/start') {
        ctx?.waitUntil?.(cleanup(env).catch(() => {}));
        return xbox.start(request, env, url);
      }
      if (url.pathname === '/auth/xbox/callback') return xbox.callback(request, env, url);
      return new Response(null, { status: 404, headers: baseHeaders });
    }

    const { headers, origin } = corsHeaders(request, env);
    const reply = (body, status = 200) => Response.json(body, { status, headers });
    if (request.method === 'OPTIONS') return new Response(null, { status: origin ? 204 : 403, headers });
    if (url.pathname === '/api/steam/status' && request.method === 'GET') {
      return reply({ sharedLogin: true, ready: Boolean(env.STEAM_WEB_API_KEY) });
    }
    if (url.pathname === '/api/xbox/status' && request.method === 'GET') return reply({ ready: xboxReady(env) });
    if (url.pathname === '/api/xbox/token') {
      return request.method === 'POST' ? xbox.exchange(request, env, reply, origin) : reply({ error: 'method_not_allowed' }, 405);
    }
    if (url.pathname === '/api/xbox/library') {
      return request.method === 'GET' ? xbox.library(request, env, reply, origin) : reply({ error: 'method_not_allowed' }, 405);
    }
    if (url.pathname === '/api/steam/token') {
      return request.method === 'POST' ? exchange(request, env, reply, origin) : reply({ error: 'method_not_allowed' }, 405);
    }
    if (url.pathname === '/api/steam/library') {
      return request.method === 'GET' ? library(request, env, reply, origin) : reply({ error: 'method_not_allowed' }, 405);
    }
    return reply({ error: 'not_found' }, 404);
  },
};
