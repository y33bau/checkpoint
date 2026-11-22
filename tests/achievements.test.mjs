import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, it } from 'node:test';
import vm from 'node:vm';
import worker, { sha256 } from '../integrations/steam/worker.mjs';
import { attachXboxAchievements, xboxAchievementRows } from '../integrations/steam/xbox.mjs';
import { parseAppIds, steamAchievementRows } from '../integrations/steam/achievements.mjs';
import { createD1 } from './helpers/d1.mjs';
import { installSteamFetch, playerAchievements, schemaAchievements, steamAssertion, steamId } from './helpers/steam.mjs';
import { achievementLists } from './helpers/xbox.mjs';

const root = new URL('../', import.meta.url);
const server = 'https://steam.example.workers.dev';
const appUrl = 'https://y33bau.github.io/checkpoint/';
const appOrigin = 'https://y33bau.github.io';
const verifier = 'v'.repeat(43);

let env;
let steam;
beforeEach(() => {
  env = { DB: createD1(new URL('integrations/steam/migrations/0001_shared_login.sql', root)), APP_URLS: appUrl, STEAM_WEB_API_KEY: 'test-key' };
  steam = installSteamFetch();
});
afterEach(() => steam.restore());

const call = (path, init = {}) => worker.fetch(new Request(new URL(path, server), init), env, { waitUntil() {} });
const api = (path, init = {}) => call(path, { ...init, headers: { Origin: appOrigin, ...init.headers } });

async function steamToken() {
  const url = new URL('/auth/steam/start', server);
  url.searchParams.set('challenge', await sha256(verifier));
  url.searchParams.set('return_to', appUrl);
  const started = await call(url.pathname + url.search);
  const returnTo = new URL(started.headers.get('Location')).searchParams.get('openid.return_to');
  const callback = new URL(returnTo);
  for (const [key, value] of steamAssertion(returnTo)) callback.searchParams.set(key, value);
  const done = await call(callback.pathname + callback.search, { headers: { Cookie: started.headers.get('Set-Cookie').split(';')[0] } });
  const code = new URL(done.headers.get('Location')).searchParams.get('steam_code');
  const response = await api('/api/steam/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, verifier }) });
  return (await response.json()).token;
}

describe('Steam achievements on the shared worker', () => {
  it('returns the player achievements with icons for several games', async () => {
    const token = await steamToken();
    const response = await api('/api/steam/achievements?appids=620,1145360&lang=en', { headers: { Authorization: 'Bearer ' + token } });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.steamId, steamId);
    const [portal, hades] = data.games;
    assert.equal(portal.appid, 620);
    assert.deepEqual(portal.achievements[0], {
      id: 'ACH.SURVIVE_CONTAINER_RIDE', name: 'Wake Up Call', description: 'Survive the manual override', unlocked: true,
      unlockedAt: 1700000000000, icon: 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/620/a.jpg',
    });
    assert.deepEqual(portal.achievements[1], { id: 'ACH.WAKE_UP', name: 'You Monster', unlocked: false, hidden: true }, 'hidden, locked: no spoiler and no foreign icon');
    assert.deepEqual(hades, { appid: 1145360, achievements: [] });
    const player = steam.calls.find(item => item.url.pathname.includes('GetPlayerAchievements'));
    assert.equal(player.url.searchParams.get('steamid'), steamId);
    assert.equal(player.url.searchParams.get('l'), 'english');
    assert.equal(player.url.searchParams.get('key'), 'test-key');
  });

  it('needs a valid import token, allowed origin and a short list of games', async () => {
    assert.equal((await api('/api/steam/achievements?appids=620', { headers: { Authorization: 'Bearer ' + 'a'.repeat(43) } })).status, 401);
    const token = await steamToken();
    assert.equal((await call('/api/steam/achievements?appids=620', { headers: { Origin: 'https://evil.example', Authorization: 'Bearer ' + token } })).status, 403);
    const many = Array.from({ length: 11 }, (_, index) => index + 1).join(',');
    assert.equal((await api('/api/steam/achievements?appids=' + many, { headers: { Authorization: 'Bearer ' + token } })).status, 400);
    assert.equal((await api('/api/steam/achievements?appids=abc', { headers: { Authorization: 'Bearer ' + token } })).status, 400);
    assert.equal((await api('/api/steam/achievements?appids=620', { method: 'POST', headers: { Authorization: 'Bearer ' + token } })).status, 405);
  });

  it('explains private achievements', async () => {
    const token = await steamToken();
    const response = await api('/api/steam/achievements?appids=999', { headers: { Authorization: 'Bearer ' + token } });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'achievements_private');
  });

  it('rate limits achievement requests', async () => {
    const token = await steamToken();
    let last;
    for (let index = 0; index < 41; index++) last = await api('/api/steam/achievements?appids=1145360', { headers: { Authorization: 'Bearer ' + token } });
    assert.equal(last.status, 429);
  });

  it('parses app ids and merges player data with the schema', () => {
    assert.deepEqual(parseAppIds('620,620,10'), [620, 10]);
    assert.equal(parseAppIds(''), null);
    assert.equal(parseAppIds('1;2'), null);
    assert.equal(steamAchievementRows(playerAchievements[620], schemaAchievements[620]).length, 2);
    assert.deepEqual(steamAchievementRows(null, null), []);
  });
});

describe('Xbox achievements during sign-in', () => {
  const identity = { xuid: '2533274800000001', authorization: 'XBL3.0 x=hash;xsts-token' };

  it('maps unlocked and secret achievements with gamerscore', () => {
    const [open, secret] = xboxAchievementRows(achievementLists[1915865634]);
    assert.deepEqual(open, { id: '1', name: 'Welcome to Mexico', description: 'Complete the opening drive', unlocked: true,
      unlockedAt: Date.parse('2026-10-01T10:00:00.000Z'), icon: 'https://images-eds-ssl.xboxlive.com/image?url=abc', gamerscore: 10 });
    assert.deepEqual(secret, { id: '2', name: 'Secret road', unlocked: false, hidden: true, gamerscore: 20 });
  });

  it('adds lists to recent titles and keeps summaries when a title fails', async () => {
    const original = globalThis.fetch;
    const seen = [];
    globalThis.fetch = async input => {
      const url = new URL(input);
      seen.push(url);
      const list = achievementLists[url.searchParams.get('titleId')];
      return list ? Response.json({ achievements: list }) : new Response(null, { status: 404 });
    };
    try {
      const games = [
        { id: '1915865634', title: 'Forza', unlocked: 1, total: 2 },
        { id: '219630713', title: 'Halo', unlocked: 0, total: 140 },
        { id: '5', title: 'No achievements' },
      ];
      await attachXboxAchievements(identity, games, 'pl-PL');
      assert.equal(games[0].achievements.length, 2);
      assert.equal(games[1].achievements, undefined);
      assert.equal(seen.length, 2, 'titles without achievements are skipped');
      assert.match(seen[0].pathname, /xuid\(2533274800000001\)\/achievements$/);
    } finally {
      globalThis.fetch = original;
    }
  });
});

// The browser part: normalizing imported lists and saving them on the playthrough.
function app() {
  const store = new Map();
  const context = vm.createContext({
    URL, Date, Math, Number, Object, JSON, Array, Error, Intl, Set, Map,
    localStorage: { setItem: (key, value) => store.set(key, value), getItem: key => store.get(key) ?? null },
  });
  vm.runInContext('var games = []; var t = label => label; var appLanguage = () => "pl"; var appLocale = () => "pl-PL";' +
    'var esc = s => String(s ?? ""); var btn = (label, act) => "<button data-act=\\"" + act + "\\">" + label + "</button>";' +
    'var bar = p => "<bar " + p + ">"; function persist(){ localStorage.setItem("checkpoint-diary-v1", JSON.stringify(games)) }', context);
  vm.runInContext(readFileSync(new URL('achievements.js', root), 'utf8'), context);
  return { context, store, run: code => vm.runInContext(code, context) };
}

describe('achievements in the app', () => {
  it('keeps only safe fields and known image hosts', () => {
    const page = app();
    const rows = page.run(`normalizeAchievementList([
      { id: 'a', name: ' First ', description: 'x'.repeat(500), unlocked: true, unlockedAt: '2026-10-01T10:00:00.000Z', icon: 'https://cdn.akamai.steamstatic.com/a.jpg', extra: 1 },
      { name: 'Second', unlocked: 'yes', icon: 'javascript:alert(1)', gamerscore: 20 },
      { name: '' }, null,
    ])`);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].name, 'First');
    assert.equal(rows[0].description.length, 400);
    assert.equal(rows[0].unlockedAt, Date.parse('2026-10-01T10:00:00.000Z'));
    assert.equal(rows[0].extra, undefined);
    assert.equal(rows[1].unlocked, false);
    assert.equal(rows[1].icon, undefined);
    assert.equal(page.run('normalizeAchievementList("nope")'), undefined);
  });

  it('stores the list and summary on the playthrough, additively', () => {
    const page = app();
    page.run(`games.push({ id: 'g', title: 'Forza', system: 'Xbox', runs: { Xbox: { progress: 0, goal: '', sessions: [], sourceAchievements: { unlocked: 0, total: 9 } } } });
      setAchievementList(games[0].runs.Xbox, normalizeAchievementList([
        { name: 'A', unlocked: true, gamerscore: 10 }, { name: 'B', unlocked: false, gamerscore: 20 } ]));
      persistAchievements();`);
    const saved = JSON.parse(page.store.get('checkpoint-diary-v1'))[0].runs.Xbox;
    assert.equal(saved.progress, 0);
    assert.equal(saved.sourceAchievements.unlocked, 1);
    assert.equal(saved.sourceAchievements.total, 2);
    assert.equal(saved.sourceAchievements.gamerscore, 10);
    assert.equal(saved.sourceAchievements.gamerscoreTotal, 30);
    assert.equal(saved.sourceAchievements.list.length, 2);
    const html = page.run('achievementsPanel(games[0], games[0].runs.Xbox)');
    assert.match(html, /1 \/ 2 · 50%/);
    assert.match(html, /Lista osiągnięć \(2\)/);
  });

  it('drops lists but keeps summaries when browser storage is full', () => {
    const page = app();
    page.run(`games.push({ id: 'g', title: 'Portal', system: 'Steam', steamAppId: 620, runs: { Steam: { progress: 0, goal: '', sessions: [] } } });
      setAchievementList(games[0].runs.Steam, [{ id: 'a', name: 'A', unlocked: true }]);
      let calls = 0; const save = persist;
      persist = () => { if (calls++ === 0) throw Error('QuotaExceededError'); save(); };
      globalThis.kept = persistAchievements();`);
    assert.equal(page.run('kept'), false);
    const saved = JSON.parse(page.store.get('checkpoint-diary-v1'))[0].runs.Steam.sourceAchievements;
    assert.equal(saved.list, undefined);
    assert.equal(saved.unlocked, 1);
  });

  it('offers a Steam download button on Steam games without data', () => {
    const page = app();
    const html = page.run(`achievementsPanel({ id: 'g', system: 'Steam', steamAppId: 620 }, { sessions: [] })`);
    assert.match(html, /data-act="steam-achievements"/);
    assert.equal(page.run(`achievementsPanel({ id: 'g', system: 'PC' }, { sessions: [] })`), '');
  });
});
