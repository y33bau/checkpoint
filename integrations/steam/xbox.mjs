// Xbox sign-in for the shared Checkpoint server.
// Flow: /auth/xbox/start (app PKCE challenge) -> Microsoft sign-in (personal accounts, own PKCE)
// -> /auth/xbox/callback: code -> Microsoft token -> Xbox user token -> XSTS -> titlehub history.
// Microsoft and Xbox tokens live only for the duration of the callback and are never stored.
// The game list is kept for the import window, then the app gets a one-time code
// -> POST /api/xbox/token (code + verifier) -> short-lived import token -> GET /api/xbox/library.
// Vars: XBOX_CLIENT_ID. Secret: XBOX_CLIENT_SECRET.

const authority = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
const userAuthUrl = 'https://user.auth.xboxlive.com/user/authenticate';
const xstsUrl = 'https://xsts.auth.xboxlive.com/xsts/authorize';
const titlehub = 'https://titlehub.xboxlive.com';
const scope = 'XboxLive.signin';
const cookieName = '__Host-checkpoint-xbox';
const challengePattern = /^[A-Za-z0-9_-]{43}$/;
const secretPattern = /^[A-Za-z0-9_-]{43,128}$/;
const statePattern = /^[A-Za-z0-9_-]{43}$/;
const maxGames = 5000;

export const xboxLimits = {
  xbox_start: { max: 10, window: 600 },
  xbox_token: { max: 20, window: 600 },
  xbox_library: { max: 20, window: 600 },
};
export const xboxTables = ['xbox_login_states', 'xbox_login_codes', 'xbox_import_tokens'];

export const xboxReady = env => Boolean(env.XBOX_CLIENT_ID && env.XBOX_CLIENT_SECRET);

function cookieHeader(value, maxAge) {
  return cookieName + '=' + value + '; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=' + maxAge;
}

const callbackAddress = url => new URL('/auth/xbox/callback', url.origin).href;

class XboxError extends Error {
  constructor(code) { super(code); this.code = code; }
}

async function postJson(url, body, headers = {}) {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new XboxError('xbox_unavailable');
  }
  const data = await response.json().catch(() => null);
  return { response, data };
}

async function microsoftToken(env, code, verifier, redirectUri) {
  let response;
  try {
    response = await fetch(authority + '/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        client_id: env.XBOX_CLIENT_ID,
        client_secret: env.XBOX_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        scope,
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new XboxError('xbox_unavailable');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || typeof data?.access_token !== 'string') throw new XboxError('invalid');
  return data.access_token;
}

// XSTS errors: 2148916233 = no Xbox profile, 2148916238 = child account needs family consent.
const xstsErrors = { 2148916233: 'no_profile', 2148916235: 'region', 2148916236: 'adult_check', 2148916237: 'adult_check', 2148916238: 'child' };

async function xboxIdentity(accessToken) {
  const user = await postJson(userAuthUrl, {
    Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: 'd=' + accessToken },
    RelyingParty: 'http://auth.xboxlive.com',
    TokenType: 'JWT',
  }, { 'x-xbl-contract-version': '1' });
  if (!user.response.ok || typeof user.data?.Token !== 'string') throw new XboxError('xbox_unavailable');

  const xsts = await postJson(xstsUrl, {
    Properties: { SandboxId: 'RETAIL', UserTokens: [user.data.Token] },
    RelyingParty: 'http://xboxlive.com',
    TokenType: 'JWT',
  }, { 'x-xbl-contract-version': '1' });
  if (xsts.response.status === 401 && xstsErrors[xsts.data?.XErr]) throw new XboxError(xstsErrors[xsts.data.XErr]);
  const claims = xsts.data?.DisplayClaims?.xui?.[0];
  if (!xsts.response.ok || typeof xsts.data?.Token !== 'string' || !/^\d{1,20}$/.test(claims?.xid ?? '') || typeof claims?.uhs !== 'string') {
    throw new XboxError('xbox_unavailable');
  }
  return {
    authorization: 'XBL3.0 x=' + claims.uhs + ';' + xsts.data.Token,
    xuid: claims.xid,
    gamertag: typeof claims.gtg === 'string' ? claims.gtg.slice(0, 40) : '',
  };
}

function httpsImage(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'http:') url.protocol = 'https:';
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

const count = (value, max) => Number.isInteger(value) && value >= 0 && value <= max ? value : undefined;

// Maps titlehub titles to the checkpoint-source-v1 rows the app already imports from Checkpoint Bridge.
export function xboxGames(titles) {
  const rows = new Map();
  for (const item of Array.isArray(titles) ? titles : []) {
    if (item?.type && item.type !== 'Game') continue;
    const title = typeof item?.name === 'string' ? item.name.trim().slice(0, 180) : '';
    const id = /^\d{1,12}$/.test(String(item?.titleId ?? '')) ? String(item.titleId) : '';
    if (!title || !id || rows.has(id)) continue;
    const achievement = item.achievement ?? {};
    const lastPlayed = Date.parse(item.titleHistory?.lastTimePlayed ?? '');
    const row = {
      id,
      title,
      cover: httpsImage(item.displayImage),
      lastPlayed: Number.isFinite(lastPlayed) ? new Date(lastPlayed).toISOString() : undefined,
      unlocked: count(achievement.currentAchievements, 10000),
      total: count(achievement.totalAchievements, 10000),
      gamerscore: count(achievement.currentGamerscore, 10000000),
      gamerscoreTotal: count(achievement.totalGamerscore, 10000000),
      activity: 'played',
    };
    rows.set(id, Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined && value !== '')));
    if (rows.size >= maxGames) break;
  }
  return [...rows.values()];
}

async function titleHistory(identity) {
  const url = new URL('/users/xuid(' + identity.xuid + ')/titles/titlehistory/decoration/achievement,image', titlehub);
  url.searchParams.set('maxItems', String(maxGames));
  let response;
  try {
    response = await fetch(url, {
      headers: { Authorization: identity.authorization, 'x-xbl-contract-version': '2', 'Accept-Language': 'en-US', Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new XboxError('xbox_unavailable');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(data?.titles)) throw new XboxError('xbox_unavailable');
  return xboxGames(data.titles);
}

export function createXbox(kit) {
  const { appUrls, overLimit, sha256, randomSecret, nowSeconds, baseHeaders, redirect, lifetimes } = kit;

  function appRedirect(returnUrl, params, clearCookie = true) {
    const target = new URL(returnUrl);
    for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
    target.hash = 'connections';
    return redirect(target.href, clearCookie ? cookieHeader('', 0) : null);
  }

  async function start(request, env, url) {
    const challenge = url.searchParams.get('challenge') || '';
    const returnTo = url.searchParams.get('return_to') || '';
    if (!appUrls(env).includes(returnTo)) return new Response('Unknown application address.', { status: 400, headers: baseHeaders });
    if (!xboxReady(env)) return appRedirect(returnTo, { xbox_error: 'server_not_configured' }, false);
    if (!challengePattern.test(challenge)) return appRedirect(returnTo, { xbox_error: 'invalid' }, false);
    if (await overLimit(env, 'xbox_start', request)) return appRedirect(returnTo, { xbox_error: 'rate_limited' }, false);

    const state = randomSecret();
    const verifier = randomSecret();
    await env.DB.prepare('INSERT INTO xbox_login_states (state, challenge, ms_verifier, return_url, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(state, challenge, verifier, returnTo, nowSeconds() + lifetimes.state).run();
    const target = new URL(authority + '/authorize');
    target.search = new URLSearchParams({
      client_id: env.XBOX_CLIENT_ID,
      response_type: 'code',
      redirect_uri: callbackAddress(url),
      response_mode: 'query',
      scope,
      state,
      code_challenge: await sha256(verifier),
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    return redirect(target.href, cookieHeader(state, lifetimes.state));
  }

  async function callback(request, env, url) {
    const state = url.searchParams.get('state') || '';
    const fallback = appUrls(env)[0];
    const stored = statePattern.test(state)
      ? await env.DB.prepare('DELETE FROM xbox_login_states WHERE state = ?1 RETURNING challenge, ms_verifier, return_url, expires_at').bind(state).first()
      : null;
    if (!stored || stored.expires_at <= nowSeconds()) {
      return fallback ? appRedirect(fallback, { xbox_error: 'expired' }) : new Response(null, { status: 400, headers: baseHeaders });
    }
    const returnUrl = stored.return_url;
    const cookie = request.headers.get('Cookie')?.match(/(?:^|;\s*)__Host-checkpoint-xbox=([A-Za-z0-9_-]{43})(?=;|$)/)?.[1];
    if (cookie !== state) return appRedirect(returnUrl, { xbox_error: 'session' });
    const error = url.searchParams.get('error');
    if (error) return appRedirect(returnUrl, { xbox_error: error === 'access_denied' ? 'cancelled' : 'invalid' });
    const code = url.searchParams.get('code') || '';
    if (!code || code.length > 2048) return appRedirect(returnUrl, { xbox_error: 'invalid' });

    let identity;
    let library;
    try {
      const accessToken = await microsoftToken(env, code, stored.ms_verifier, callbackAddress(url));
      identity = await xboxIdentity(accessToken);
      library = await titleHistory(identity);
    } catch (failure) {
      return appRedirect(returnUrl, { xbox_error: failure instanceof XboxError ? failure.code : 'xbox_unavailable' });
    }

    const appCode = randomSecret();
    await env.DB.prepare('INSERT INTO xbox_login_codes (code_hash, challenge, origin, gamertag, library, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
      .bind(await sha256(appCode), stored.challenge, new URL(returnUrl).origin, identity.gamertag, JSON.stringify(library), nowSeconds() + lifetimes.code).run();
    return appRedirect(returnUrl, { xbox_code: appCode });
  }

  async function exchange(request, env, reply, origin) {
    if (!origin) return reply({ error: 'origin_not_allowed' }, 403);
    if (await overLimit(env, 'xbox_token', request)) return reply({ error: 'rate_limited' }, 429);
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
    const stored = await env.DB.prepare('DELETE FROM xbox_login_codes WHERE code_hash = ?1 RETURNING challenge, origin, gamertag, library, expires_at')
      .bind(await sha256(code)).first();
    if (!stored || stored.expires_at <= nowSeconds() || stored.origin !== origin || stored.challenge !== await sha256(verifier)) {
      return reply({ error: 'invalid_code' }, 400);
    }
    const token = randomSecret();
    await env.DB.prepare('INSERT INTO xbox_import_tokens (token_hash, origin, gamertag, library, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(await sha256(token), origin, stored.gamertag, stored.library, nowSeconds() + lifetimes.token).run();
    return reply({ token, gamertag: stored.gamertag, expiresIn: lifetimes.token });
  }

  async function library(request, env, reply, origin) {
    if (!origin) return reply({ error: 'origin_not_allowed' }, 403);
    if (await overLimit(env, 'xbox_library', request)) return reply({ error: 'rate_limited' }, 429);
    const token = /^Bearer ([A-Za-z0-9_-]{43,128})$/.exec(request.headers.get('Authorization') || '')?.[1];
    const stored = token
      ? await env.DB.prepare('SELECT origin, gamertag, library, expires_at FROM xbox_import_tokens WHERE token_hash = ?1').bind(await sha256(token)).first()
      : null;
    if (!stored || stored.expires_at <= nowSeconds() || stored.origin !== origin) return reply({ error: 'login_required' }, 401);
    let games;
    try { games = JSON.parse(stored.library); } catch { games = null; }
    if (!Array.isArray(games)) return reply({ error: 'xbox_unavailable' }, 502);
    return reply({ format: 'checkpoint-source-v1', provider: 'xbox', gamertag: stored.gamertag, games });
  }

  return { start, callback, exchange, library };
}
