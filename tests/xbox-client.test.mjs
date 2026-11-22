import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, it } from 'node:test';
import vm from 'node:vm';
import worker from '../integrations/steam/worker.mjs';
import { createD1 } from './helpers/d1.mjs';
import { gamertag, installXboxFetch } from './helpers/xbox.mjs';

const root = new URL('../', import.meta.url);
const source = name => readFileSync(new URL(name, root), 'utf8');
const server = 'https://steam.example.workers.dev';
const appUrl = 'https://y33bau.github.io/checkpoint/';

function browser(env, href = appUrl + '#connections') {
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
    URL, URLSearchParams, TextEncoder, AbortSignal, Response, JSON, Date, Math, Number, Object, Error, Uint8Array, Promise, Map, Set,
    btoa, crypto: globalThis.crypto, console, location,
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
  vm.runInContext(source('steam-config.js').replace(/checkpointSteamServer = '[^']*'/, 'checkpointSteamServer = ' + JSON.stringify(server)), context);
  vm.runInContext(source('steam-login.js'), context);
  vm.runInContext(source('xbox-login.js'), context);
  vm.runInContext(source('console-sync.js'), context);
  vm.runInContext('var t = label => label; function web(s){try{const u=new URL(s);return ["https:","http:"].includes(u.protocol)?u.href:""}catch{return ""}}', context);
  return { location, assigned, storage, run: code => vm.runInContext(code, context) };
}

// Plays the part of the user on the Microsoft sign-in page.
async function signInWithMicrosoft(startUrl, env) {
  const ctx = { waitUntil() {} };
  const started = await worker.fetch(new Request(startUrl), env, ctx);
  const microsoft = new URL(started.headers.get('Location'));
  const callback = new URL(microsoft.searchParams.get('redirect_uri'));
  callback.searchParams.set('state', microsoft.searchParams.get('state'));
  callback.searchParams.set('code', 'ms-code');
  const cookie = started.headers.get('Set-Cookie').split(';')[0];
  const done = await worker.fetch(new Request(callback, { headers: { Cookie: cookie } }), env, ctx);
  return done.headers.get('Location');
}

let env;
let xbox;
beforeEach(() => {
  const DB = createD1(new URL('integrations/steam/migrations/0001_shared_login.sql', root));
  DB.raw.exec(source('integrations/steam/migrations/0002_xbox_login.sql'));
  env = { DB, APP_URLS: appUrl, XBOX_CLIENT_ID: 'client-123', XBOX_CLIENT_SECRET: 'test-secret' };
  xbox = installXboxFetch();
});
afterEach(() => xbox.restore());

describe('Xbox sign-in in the app', () => {
  it('connects Xbox and produces rows the existing import preview accepts', async () => {
    const page = browser(env);
    await page.run('beginXboxLogin()');
    const start = new URL(page.assigned[0]);
    assert.equal(start.origin + start.pathname, server + '/auth/xbox/start');
    const pending = JSON.parse(page.storage.get('checkpoint-xbox-login-v1'));
    assert.equal(start.href.includes(pending.verifier), false, 'verifier stays in the browser');

    page.location.href = await signInWithMicrosoft(start, env);
    page.run('globalThis.result = takeXboxReturn()');
    assert.equal(page.location.href, appUrl + '#connections', 'code is removed from the address bar');
    const session = await page.run('redeemXboxCode(result.code, result.pending)');
    assert.equal(session.gamertag, gamertag);
    const library = await page.run('loadXboxLibrary()');
    const rows = page.run('normalizeSourceRows')(library, 'xbox');
    assert.equal(JSON.stringify(rows.map(row => [row.id, row.title, row.gamerscore])),
      JSON.stringify([['1915865634', 'Forza Horizon 5', 230], ['219630713', 'Halo Infinite', undefined]]));
    assert.ok(Number.isFinite(rows[0].lastPlayed));
  });

  it('keeps Steam and Xbox returns apart and explains errors', () => {
    const page = browser(env, appUrl + '?xbox_error=no_profile#connections');
    assert.equal(page.run('takeSteamReturn()'), null);
    assert.equal(page.run('takeXboxReturn()').error, 'no_profile');
    assert.match(page.run('xboxErrorMessage("no_profile")'), /profilu Xbox/);
    assert.equal(page.location.href, appUrl + '#connections');
  });

  it('treats a code without a pending login as expired', () => {
    const page = browser(env, appUrl + '?xbox_code=' + 'a'.repeat(43) + '#connections');
    assert.equal(page.run('takeXboxReturn()').error, 'expired');
  });
});
