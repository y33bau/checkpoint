import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, it } from 'node:test';
import vm from 'node:vm';
import worker from '../integrations/steam/worker.mjs';
import { createD1 } from './helpers/d1.mjs';
import { games, installSteamFetch, steamAssertion, steamId } from './helpers/steam.mjs';

const root = new URL('../', import.meta.url);
const source = name => readFileSync(new URL(name, root), 'utf8');
const migration = new URL('integrations/steam/migrations/0001_shared_login.sql', root);
const server = 'https://steam.example.workers.dev';
const appUrl = 'https://y33bau.github.io/checkpoint/';

// Loads the browser scripts into a small fake window whose fetch goes straight to the Worker.
function browser({ href = appUrl + '#connections', configured = server, env } = {}) {
  const storage = new Map();
  const assigned = [];
  const location = {
    get href() { return this.current.href; },
    set href(value) { this.current = new URL(value); },
    get origin() { return this.current.origin; },
    get pathname() { return this.current.pathname; },
    get hostname() { return this.current.hostname; },
    get hash() { return this.current.hash; },
    assign(value) { assigned.push(value); },
    current: new URL(href),
  };
  const context = vm.createContext({
    URL, URLSearchParams, TextEncoder, AbortSignal, Response, JSON, Date, Math, Number, Object, Error, Uint8Array, Promise,
    btoa, crypto: globalThis.crypto, console,
    location,
    history: { replaceState(_state, _title, value) { location.href = value; } },
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
    },
    fetch: async (input, init = {}) => {
      const headers = new Headers(init.headers);
      headers.set('Origin', location.origin);
      return worker.fetch(new Request(input, { ...init, headers, signal: undefined }), env, { waitUntil() {} });
    },
  });
  vm.runInContext(source('steam-config.js').replace(/checkpointSteamServer = '[^']*'/, 'checkpointSteamServer = ' + JSON.stringify(configured)), context);
  vm.runInContext(source('steam-login.js'), context);
  vm.runInContext(source('import-review.js'), context);
  vm.runInContext('var t = label => label;', context);
  return { context, location, assigned, storage, run: code => vm.runInContext(code, context) };
}

// Plays the part of the user on the Steam website and returns where Steam sends them back.
async function signInOnSteam(startUrl, env) {
  const ctx = { waitUntil() {} };
  const started = await worker.fetch(new Request(startUrl), env, ctx);
  const returnTo = new URL(started.headers.get('Location')).searchParams.get('openid.return_to');
  const callback = new URL(returnTo);
  for (const [key, value] of steamAssertion(returnTo)) callback.searchParams.set(key, value);
  const cookie = started.headers.get('Set-Cookie').split(';')[0];
  const done = await worker.fetch(new Request(callback, { headers: { Cookie: cookie } }), env, ctx);
  return done.headers.get('Location');
}

let env;
let steam;
beforeEach(() => {
  env = { DB: createD1(migration), APP_URLS: appUrl + ',http://localhost:8080/', STEAM_WEB_API_KEY: 'test-key' };
  steam = installSteamFetch();
});
afterEach(() => steam.restore());

describe('Steam sign-in in the app', () => {
  it('connects Steam without asking for a server, key or SteamID and previews the library', async () => {
    const page = browser({ env });
    await page.run('beginSteamLogin()');
    assert.equal(page.assigned.length, 1);
    const start = new URL(page.assigned[0]);
    assert.equal(start.origin + start.pathname, server + '/auth/steam/start');
    assert.equal(start.searchParams.get('return_to'), appUrl);
    const pending = JSON.parse(page.storage.get('checkpoint-steam-login-v2'));
    assert.match(pending.verifier, /^[\w-]{43}$/);
    assert.equal(start.href.includes(pending.verifier), false, 'verifier stays in the browser');

    page.location.href = await signInOnSteam(start, env);
    page.run('globalThis.result = takeSteamReturn()');
    assert.equal(page.location.href, appUrl + '#connections', 'code is removed from the address bar');
    assert.equal(page.storage.has('checkpoint-steam-login-v2'), false);

    const session = await page.run('redeemSteamCode(result.code, result.pending)');
    assert.equal(session.steamId, steamId);
    assert.equal(page.run('steamSessionValid()'), true);
    const library = await page.run('loadSteamLibrary()');
    const rows = page.run('steamGameRows')(library);
    assert.equal(JSON.stringify(rows.map(row => row.name)), JSON.stringify(games.map(game => game.name)));

    await assert.rejects(page.run('redeemSteamCode(result.code, result.pending)'), error => error.code === 'invalid_code');
  });

  it('reports Steam errors from the redirect in the user language', () => {
    const page = browser({ href: appUrl + '?steam_error=cancelled#connections', env });
    const result = page.run('takeSteamReturn()');
    assert.equal(result.error, 'cancelled');
    assert.equal(page.location.href, appUrl + '#connections');
    assert.match(page.run('steamErrorMessage("cancelled")'), /anulowane/);
    assert.match(page.run('steamErrorMessage("library_private")'), /Szczegóły gier/);
    assert.equal(page.run('takeSteamReturn()'), null);
  });

  it('treats a code without a matching pending login as expired', () => {
    const page = browser({ href: appUrl + '?steam_code=' + 'a'.repeat(43) + '#connections', env });
    assert.equal(page.run('takeSteamReturn()').error, 'expired');
  });

  it('does not start without a configured server', async () => {
    const page = browser({ configured: '', env });
    assert.equal(page.run('steamServerAddress()'), '');
    await assert.rejects(page.run('beginSteamLogin()'), error => error.code === 'not_configured');
  });

  it('accepts a local server override only when the app runs on localhost', () => {
    const remote = browser({ href: appUrl + '?steam_server=http://localhost:8787#connections', env });
    assert.equal(remote.run('steamServerAddress()'), server);
    const local = browser({ href: 'http://localhost:8080/?steam_server=http://localhost:8787#connections', configured: '', env });
    assert.equal(local.run('steamServerAddress()'), 'http://localhost:8787');
    assert.equal(local.location.href, 'http://localhost:8080/#connections');
  });

  it('forgets an expired import token', async () => {
    const page = browser({ env });
    await page.run('beginSteamLogin()');
    page.location.href = await signInOnSteam(page.assigned[0], env);
    await page.run('globalThis.result = takeSteamReturn(); redeemSteamCode(result.code, result.pending)');
    env.DB.raw.exec('UPDATE import_tokens SET expires_at = 0');
    await assert.rejects(page.run('loadSteamLibrary()'), error => error.code === 'login_required');
    assert.equal(page.run('steamSessionValid()'), false);
  });
});
