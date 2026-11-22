import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import worker, { sha256 } from '../integrations/steam/worker.mjs';
import { createD1 } from './helpers/d1.mjs';
import { games, installSteamFetch, steamAssertion, steamId } from './helpers/steam.mjs';

const migration = new URL('../integrations/steam/migrations/0001_shared_login.sql', import.meta.url);
const server = 'https://steam.example.workers.dev';
const appUrl = 'https://y33bau.github.io/checkpoint/';
const appOrigin = 'https://y33bau.github.io';
const verifier = 'v'.repeat(43);

let env;
let steam;
beforeEach(() => {
  env = { DB: createD1(migration), APP_URLS: appUrl + ',http://localhost:8080/', STEAM_WEB_API_KEY: 'test-key' };
  steam = installSteamFetch();
});
afterEach(() => steam.restore());

const call = (path, init = {}) => worker.fetch(new Request(new URL(path, server), init), env, { waitUntil() {} });
const api = (path, init = {}) => call(path, { ...init, headers: { Origin: appOrigin, ...init.headers } });

async function startLogin({ challenge, returnTo = appUrl } = {}) {
  const url = new URL('/auth/steam/start', server);
  url.searchParams.set('challenge', challenge ?? await sha256(verifier));
  url.searchParams.set('return_to', returnTo);
  return call(url.pathname + url.search);
}

async function login(options = {}) {
  const started = await startLogin(options);
  assert.equal(started.status, 303);
  const steamUrl = new URL(started.headers.get('Location'));
  const returnTo = steamUrl.searchParams.get('openid.return_to');
  const cookie = started.headers.get('Set-Cookie').split(';')[0];
  const callback = new URL(returnTo);
  for (const [key, value] of steamAssertion(returnTo, options.assertion)) callback.searchParams.set(key, value);
  const done = await call(callback.pathname + callback.search, { headers: { Cookie: options.cookie ?? cookie } });
  return { started, steamUrl, done, location: new URL(done.headers.get('Location')), callback, cookie };
}

async function exchange(code, extra = {}) {
  return api('/api/steam/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extra.headers },
    body: JSON.stringify({ code, verifier: extra.verifier ?? verifier }),
  });
}

describe('shared Steam worker', () => {
  it('sends the user to the official Steam OpenID page with a state cookie', async () => {
    const response = await startLogin();
    const target = new URL(response.headers.get('Location'));
    assert.equal(target.origin + target.pathname, 'https://steamcommunity.com/openid/login');
    assert.equal(target.searchParams.get('openid.realm'), server + '/');
    assert.match(target.searchParams.get('openid.return_to'), /^https:\/\/steam\.example\.workers\.dev\/auth\/steam\/callback\?state=/);
    assert.match(response.headers.get('Set-Cookie'), /^__Host-checkpoint-steam=[\w-]{43}; Path=\/; Secure; HttpOnly; SameSite=Lax/);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  });

  it('rejects unknown return addresses and malformed challenges', async () => {
    assert.equal((await startLogin({ returnTo: 'https://evil.example/' })).status, 400);
    const bad = await startLogin({ challenge: 'short' });
    assert.equal(new URL(bad.headers.get('Location')).searchParams.get('steam_error'), 'invalid');
  });

  it('completes login, exchanges the code once and returns the library', async () => {
    const { location } = await login();
    assert.equal(location.origin + location.pathname, appUrl);
    assert.equal(location.hash, '#connections');
    assert.equal(location.searchParams.has('steam_id'), false, 'SteamID must not travel unsigned in the URL');
    const code = location.searchParams.get('steam_code');
    assert.match(code, /^[\w-]{43}$/);

    const tokenResponse = await exchange(code);
    assert.equal(tokenResponse.status, 200);
    assert.equal(tokenResponse.headers.get('Access-Control-Allow-Origin'), appOrigin);
    assert.equal(tokenResponse.headers.get('Cache-Control'), 'no-store');
    const { token, steamId: returnedId, expiresIn } = await tokenResponse.json();
    assert.equal(returnedId, steamId);
    assert.equal(expiresIn, 600);

    assert.equal((await exchange(code)).status, 400, 'code is single use');

    const libraryResponse = await api('/api/steam/library', { headers: { Authorization: 'Bearer ' + token } });
    assert.equal(libraryResponse.status, 200);
    const body = await libraryResponse.json();
    assert.equal(body.steamId, steamId);
    assert.deepEqual(body.games.map(game => game.appid), games.map(game => game.appid));
    assert.equal('img_icon_url' in body.games[0], false);

    const upstream = steam.calls.find(item => item.url.origin === 'https://api.steampowered.com');
    assert.equal(upstream.url.searchParams.get('steamid'), steamId);
    assert.equal(upstream.url.searchParams.get('key'), 'test-key');
    assert.doesNotMatch(JSON.stringify(body), /test-key/);
  });

  it('refuses a code with the wrong verifier or from another origin', async () => {
    const { location } = await login();
    const code = location.searchParams.get('steam_code');
    assert.equal((await exchange(code, { verifier: 'w'.repeat(43) })).status, 400);
    const second = (await login({ assertion: { nonce: new Date().toISOString().slice(0, 19) + 'Zother' } })).location.searchParams.get('steam_code');
    assert.equal((await exchange(second, { headers: { Origin: 'http://localhost:8080' } })).status, 400);
  });

  it('refuses library requests without a valid token or allowed origin', async () => {
    assert.equal((await api('/api/steam/library')).status, 401);
    assert.equal((await api('/api/steam/library', { headers: { Authorization: 'Bearer ' + 'x'.repeat(43) } })).status, 401);
    const foreign = await call('/api/steam/library', { headers: { Origin: 'https://evil.example' } });
    assert.equal(foreign.status, 403);
    assert.equal(foreign.headers.get('Access-Control-Allow-Origin'), null);
  });

  it('rejects a callback without the browser state cookie', async () => {
    const { location } = await login({ cookie: '__Host-checkpoint-steam=' + 'a'.repeat(43) });
    assert.equal(location.searchParams.get('steam_error'), 'session');
  });

  it('rejects a reused state and a replayed Steam assertion', async () => {
    const first = await login();
    const replay = await call(first.callback.pathname + first.callback.search, { headers: { Cookie: first.cookie } });
    assert.equal(new URL(replay.headers.get('Location')).searchParams.get('steam_error'), 'expired');

    const nonce = new Date().toISOString().slice(0, 19) + 'Zsame';
    assert.ok((await login({ assertion: { nonce } })).location.searchParams.get('steam_code'));
    assert.equal((await login({ assertion: { nonce } })).location.searchParams.get('steam_error'), 'invalid');
  });

  it('reports a cancelled or unverified Steam login', async () => {
    assert.equal((await login({ assertion: { mode: 'cancel' } })).location.searchParams.get('steam_error'), 'cancelled');
    steam.restore();
    steam = installSteamFetch({ valid: false });
    assert.equal((await login()).location.searchParams.get('steam_error'), 'invalid');
  });

  it('explains a private game list', async () => {
    steam.restore();
    steam = installSteamFetch({ library: { response: {} } });
    const code = (await login()).location.searchParams.get('steam_code');
    const { token } = await (await exchange(code)).json();
    const response = await api('/api/steam/library', { headers: { Authorization: 'Bearer ' + token } });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'library_private');
  });

  it('expires import tokens', async () => {
    const code = (await login()).location.searchParams.get('steam_code');
    const { token } = await (await exchange(code)).json();
    env.DB.raw.exec('UPDATE import_tokens SET expires_at = 0');
    assert.equal((await api('/api/steam/library', { headers: { Authorization: 'Bearer ' + token } })).status, 401);
  });

  it('rate limits login starts per client', async () => {
    let last;
    for (let i = 0; i < 11; i++) last = await startLogin();
    assert.equal(new URL(last.headers.get('Location')).searchParams.get('steam_error'), 'rate_limited');
  });

  it('answers CORS preflight only for allowed origins', async () => {
    const ok = await api('/api/steam/token', { method: 'OPTIONS' });
    assert.equal(ok.status, 204);
    assert.match(ok.headers.get('Access-Control-Allow-Headers'), /Authorization/);
    const local = await call('/api/steam/status', { headers: { Origin: 'http://localhost:8080' } });
    assert.equal(local.headers.get('Access-Control-Allow-Origin'), 'http://localhost:8080');
    assert.equal((await call('/api/steam/token', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } })).status, 403);
  });

  it('removes the legacy single-account endpoint', async () => {
    assert.equal((await api('/?steamid=' + steamId)).status, 404);
  });

  it('reports missing configuration', async () => {
    delete env.STEAM_WEB_API_KEY;
    const code = (await login()).location.searchParams.get('steam_code');
    const { token } = await (await exchange(code)).json();
    assert.equal((await api('/api/steam/library', { headers: { Authorization: 'Bearer ' + token } })).status, 503);
    assert.equal((await worker.fetch(new Request(server + '/api/steam/status'), {}, {})).status, 503);
  });
});
