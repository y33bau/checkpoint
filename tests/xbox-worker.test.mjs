import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, it } from 'node:test';
import worker, { sha256 } from '../integrations/steam/worker.mjs';
import { xboxGames } from '../integrations/steam/xbox.mjs';
import { createD1 } from './helpers/d1.mjs';
import { gamertag, installXboxFetch, titles, xuid } from './helpers/xbox.mjs';

const migrations = new URL('../integrations/steam/migrations/', import.meta.url);
const server = 'https://steam.example.workers.dev';
const appUrl = 'https://y33bau.github.io/checkpoint/';
const appOrigin = 'https://y33bau.github.io';
const verifier = 'v'.repeat(43);

export function xboxEnv(extra = {}) {
  const DB = createD1(new URL('0001_shared_login.sql', migrations));
  DB.raw.exec(readFileSync(new URL('0002_xbox_login.sql', migrations), 'utf8'));
  return { DB, APP_URLS: appUrl, STEAM_WEB_API_KEY: 'k', XBOX_CLIENT_ID: 'client-123', XBOX_CLIENT_SECRET: 'test-secret', ...extra };
}

let env;
let xbox;
beforeEach(() => { env = xboxEnv(); xbox = installXboxFetch(); });
afterEach(() => xbox.restore());

const call = (path, init = {}) => worker.fetch(new Request(new URL(path, server), init), env, { waitUntil() {} });
const api = (path, init = {}) => call(path, { ...init, headers: { Origin: appOrigin, ...init.headers } });

async function startLogin(challenge) {
  const url = new URL('/auth/xbox/start', server);
  url.searchParams.set('challenge', challenge ?? await sha256(verifier));
  url.searchParams.set('return_to', appUrl);
  return call(url.pathname + url.search);
}

async function login({ params, cookie } = {}) {
  const started = await startLogin();
  const microsoft = new URL(started.headers.get('Location'));
  const callback = new URL(microsoft.searchParams.get('redirect_uri'));
  callback.searchParams.set('state', microsoft.searchParams.get('state'));
  for (const [key, value] of Object.entries(params ?? { code: 'ms-code' })) callback.searchParams.set(key, value);
  const done = await call(callback.pathname + callback.search, { headers: { Cookie: cookie ?? started.headers.get('Set-Cookie').split(';')[0] } });
  return { started, microsoft, done, location: new URL(done.headers.get('Location')) };
}

const exchange = code => api('/api/xbox/token', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, verifier }),
});

describe('Xbox sign-in on the shared worker', () => {
  it('sends the user to Microsoft sign-in for personal accounts with PKCE', async () => {
    const { microsoft, started } = await login();
    assert.equal(microsoft.origin + microsoft.pathname, 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize');
    assert.equal(microsoft.searchParams.get('client_id'), 'client-123');
    assert.equal(microsoft.searchParams.get('redirect_uri'), server + '/auth/xbox/callback');
    assert.equal(microsoft.searchParams.get('scope'), 'XboxLive.signin');
    assert.equal(microsoft.searchParams.get('code_challenge_method'), 'S256');
    assert.match(started.headers.get('Set-Cookie'), /^__Host-checkpoint-xbox=[\w-]{43}; Path=\/; Secure; HttpOnly; SameSite=Lax/);
  });

  it('signs in, stores no Microsoft tokens and returns the play history once', async () => {
    const { location } = await login();
    assert.equal(location.origin + location.pathname, appUrl);
    assert.equal(location.hash, '#connections');
    const code = location.searchParams.get('xbox_code');
    assert.match(code, /^[\w-]{43}$/);
    const dump = JSON.stringify(env.DB.raw.prepare('SELECT * FROM xbox_login_codes').all());
    assert.ok(!/ms-access|user-token|xsts-token|test-secret/.test(dump));
    assert.ok(!dump.includes(code));

    const tokenResponse = await exchange(code);
    assert.equal(tokenResponse.status, 200);
    const session = await tokenResponse.json();
    assert.equal(session.gamertag, gamertag);
    assert.equal((await exchange(code)).status, 400, 'the code works once');

    const library = await api('/api/xbox/library', { headers: { Authorization: 'Bearer ' + session.token } });
    assert.equal(library.status, 200);
    const data = await library.json();
    assert.equal(data.format, 'checkpoint-source-v1');
    assert.equal(data.provider, 'xbox');
    assert.deepEqual(data.games.map(game => game.id), ['1915865634', '219630713']);
    assert.equal(data.games[0].cover, 'https://store-images.s-microsoft.com/image/apps.1.jpg');
    assert.equal(data.games[0].gamerscore, 230);
    assert.equal(data.games[0].lastPlayed, '2026-11-01T18:00:00.000Z');
    const titlehub = xbox.calls.find(item => item.url.origin === 'https://titlehub.xboxlive.com');
    assert.match(titlehub.url.pathname, new RegExp('xuid\\(' + xuid + '\\)'));
  });

  it('rejects the code without the matching verifier or from another site', async () => {
    const { location } = await login();
    const code = location.searchParams.get('xbox_code');
    const wrong = await api('/api/xbox/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, verifier: 'w'.repeat(43) }) });
    assert.equal(wrong.status, 400);
    const { location: again } = await login();
    const foreign = await call('/api/xbox/token', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ code: again.searchParams.get('xbox_code'), verifier }) });
    assert.equal(foreign.status, 403);
  });

  it('requires the state cookie from the same browser', async () => {
    const { location } = await login({ cookie: '__Host-checkpoint-xbox=' + 'x'.repeat(43) });
    assert.equal(location.searchParams.get('xbox_error'), 'session');
  });

  it('reports a cancelled sign-in and missing Xbox profiles', async () => {
    const cancelled = await login({ params: { error: 'access_denied' } });
    assert.equal(cancelled.location.searchParams.get('xbox_error'), 'cancelled');
    xbox.restore();
    xbox = installXboxFetch({ xstsError: 2148916233 });
    const noProfile = await login();
    assert.equal(noProfile.location.searchParams.get('xbox_error'), 'no_profile');
  });

  it('turns a rejected Microsoft code into an invalid sign-in', async () => {
    const { location } = await login({ params: { code: 'other' } });
    assert.equal(location.searchParams.get('xbox_error'), 'invalid');
  });

  it('says when the Microsoft app is not configured', async () => {
    env = xboxEnv({ XBOX_CLIENT_SECRET: '' });
    const started = await startLogin();
    assert.equal(new URL(started.headers.get('Location')).searchParams.get('xbox_error'), 'server_not_configured');
    const status = await api('/api/xbox/status');
    assert.deepEqual(await status.json(), { ready: false });
  });

  it('refuses unknown return addresses and bad tokens', async () => {
    const url = new URL('/auth/xbox/start', server);
    url.searchParams.set('challenge', await sha256(verifier));
    url.searchParams.set('return_to', 'https://evil.example/');
    assert.equal((await call(url.pathname + url.search)).status, 400);
    const library = await api('/api/xbox/library', { headers: { Authorization: 'Bearer ' + 'a'.repeat(43) } });
    assert.equal(library.status, 401);
  });

  it('keeps only games with ids and titles', () => {
    assert.deepEqual(xboxGames(titles).map(row => row.title), ['Forza Horizon 5', 'Halo Infinite']);
    assert.deepEqual(xboxGames(null), []);
  });
});
