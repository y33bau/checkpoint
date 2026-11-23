import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createPsnLibrary } from '../integrations/steam/psn.mjs';
import worker from '../integrations/steam/worker.mjs';

const origin = 'https://y33bau.github.io';
const endpoint = 'https://example.workers.dev/api/psn/library';
const env = { PSN_NPSSO: 'test-session', PSN_SERVICE_ONLINE_ID: 'ServiceProfile' };
const request = onlineId => new Request(endpoint, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
  body: JSON.stringify({ onlineId }),
});
const reply = (body, status = 200) => Response.json(body, { status });

function fixture(options = {}) {
  const offsets = [];
  let authCalls = 0;
  const api = {
    async exchangeNpssoForAccessCode() { authCalls++; return 'code'; },
    async exchangeAccessCodeForAuthTokens() { return { accessToken: 'token', expiresIn: 3600 }; },
    async makeUniversalSearch(_auth, _id, domain) {
      return { domainResponses: [{ domain, results: [
        { socialMetadata: { onlineId: 'PSPlayer2', accountId: '50' } },
        { socialMetadata: { onlineId: 'PSPlayer', accountId: '156' } },
      ] }] };
    },
    async getUserPlayedGames(auth, accountId, { offset }) {
      assert.equal(auth.accessToken, 'token');
      assert.equal(accountId, '156');
      offsets.push(offset);
      if (options.historyError) throw Error(options.historyError);
      if (options.empty) return { titles: [] };
      if (!offset) return {
        titles: [
          { titleId: 'PPSA01', concept: { id: 403, name: 'Quest' }, playDuration: 'PT1H12M30S' },
          { titleId: 'PC01', name: 'PC title', category: 'pspc_game' },
        ],
        nextOffset: 50,
      };
      return { titles: [
        { titleId: 'CUSA01', concept: { id: 403, name: 'Quest' }, playDuration: 'PT2H' },
        { titleId: 'CUSA02', localizedName: 'Trail', lastPlayedDateTime: '2026-11-01T09:20:00Z' },
      ] };
    },
  };
  const handler = createPsnLibrary(async (_env, action) => action === options.limit, async () => api);
  return { handler, offsets, authCalls: () => authCalls };
}

test('imports exact PSN matches, reads multiple history pages, and merges console versions', async () => {
  const f = fixture();
  const response = await f.handler(request('psplayer'), env, reply, origin);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    format: 'checkpoint-source-v1', provider: 'ps', onlineId: 'PSPlayer',
    games: [
      { id: '403', title: 'Quest', minutes: 120, activity: 'played' },
      { id: 'CUSA02', title: 'Trail', lastPlayed: '2026-11-01T09:20:00Z', activity: 'played' },
    ],
    partial: false,
  });
  assert.deepEqual(f.offsets, [0, 50]);
  await f.handler(request('PSPlayer'), env, reply, origin);
  assert.equal(f.authCalls(), 1, 'operator session is reused');
});

test('does not import on partial username matches or expose the service profile', async () => {
  const f = fixture();
  assert.equal((await f.handler(request('PSPlay'), env, reply, origin)).status, 404);
  assert.equal((await f.handler(request('serviceprofile'), env, reply, origin)).status, 404);
  assert.deepEqual(f.offsets, []);
});

test('returns clear errors for private histories, empty histories, and rate limits', async () => {
  for (const [options, status, error] of [
    [{ historyError: 'Forbidden' }, 404, 'profile_unavailable'],
    [{ empty: true }, 404, 'no_games'],
    [{ historyError: 'Bad upstream response' }, 502, 'psn_unavailable'],
    [{ limit: 'psnShared' }, 429, 'rate_limited'],
  ]) {
    const response = await fixture(options).handler(request('PSPlayer'), env, reply, origin);
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error });
  }
});

test('the shared Worker exposes the PSN import route only to allowed app origins', async () => {
  const workerEnv = { DB: {}, APP_URLS: origin + '/checkpoint/' };
  const unconfigured = await worker.fetch(request('PSPlayer'), workerEnv);
  assert.equal(unconfigured.status, 503);
  assert.equal(unconfigured.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(unconfigured.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await unconfigured.json(), { error: 'psn_not_configured' });
  const rejected = await worker.fetch(new Request(endpoint, { method: 'POST' }), workerEnv);
  assert.equal(rejected.status, 403);
});

function browser() {
  const submit = { disabled: false };
  const status = {};
  const form = { onlineId: 'PSPlayer' };
  const dialog = new EventTarget();
  dialog.close = function () { this.open = false; this.dispatchEvent(new Event('close')); };
  const calls = [];
  const context = vm.createContext({
    dialog, form, t: value => value, render() {}, attachCriticScores() {},
    openForm() { dialog.open = true; submit.disabled = false; },
    input() { return '<input>'; },
    appLanguage: () => 'pl',
    document: { querySelector: name => name === '#save' ? submit : status },
    FormData: class { get(name) { return form[name]; } },
    URL, AbortController, structuredClone, setTimeout, clearTimeout,
    async fetch(url, options) {
      calls.push({ url: url.href, body: options.body });
      if (form.onlineId === 'HiddenUser') return reply({ error: 'profile_unavailable' }, 404);
      return reply({
        format: 'checkpoint-source-v1', provider: 'ps', onlineId: 'PSPlayer',
        games: [{ id: '403', title: 'Quest', minutes: 120, activity: 'played' }],
      });
    },
    connections: {}, deviceBusy: false, stored: null, importRecord: null,
  });
  vm.runInContext(`
    let games = [{id:'existing', title:'Quest', system:'Xbox', scores:[9], runs:{Xbox:{progress:26}}, maps:[]}];
    const game=(title,system,cover)=>({title,system,cover,runs:{[system]:run()},maps:[]});
    const run=()=>({progress:0});
    const web=()=> '';
    const normalizeAchievementList=()=>undefined;
    const catalogText=title=>title.toLowerCase();
    const persist=()=>{ stored=structuredClone(games) };
    const persistAchievements=persist;
    const steamServerAddress=()=> 'https://example.workers.dev';
    const recordLastImport=(...args)=>{ importRecord=args };
  `, context);
  for (const file of ['console-sync.js', 'psn-import.js']) {
    vm.runInContext(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), context);
  }
  return { context, status, form, dialog, calls, open: () => vm.runInContext('openPsnImport()', context) };
}

test('submitting a nickname directly imports the game, preserving the existing rating and platform', async () => {
  const b = browser();
  for (let i = 0; i < 2; i++) {
    b.open();
    await b.form.onsubmit({ preventDefault() {} });
    assert.equal(b.dialog.open, false);
  }
  assert.deepEqual(b.calls[0], { url: endpoint, body: '{"onlineId":"PSPlayer"}' });
  assert.equal(b.context.stored.length, 1);
  assert.equal(b.context.stored[0].id, 'existing');
  assert.equal(b.context.stored[0].scores[0], 9);
  assert.equal(b.context.stored[0].runs.Xbox.progress, 26);
  assert.equal(b.context.stored[0].runs.PlayStation.importedMinutes, 120);
  assert.equal(b.context.connections.ps.profile, 'PSPlayer');
  assert.equal(b.context.importRecord[2], 0, 'refresh does not add a duplicate');
  assert.equal(b.context.importRecord[3], 'psn-profile');
});

test('a private history leaves the import form open and the library unchanged', async () => {
  const b = browser();
  b.form.onlineId = 'HiddenUser';
  b.open();
  await b.form.onsubmit({ preventDefault() {} });
  assert.equal(b.dialog.open, true);
  assert.match(b.status.textContent, /widoczność historii gier/);
  assert.equal(b.context.stored, null);
  assert.equal(b.context.connections.ps, undefined);
});
