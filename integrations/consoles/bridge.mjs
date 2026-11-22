import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { xboxLibrary, xboxTitleAchievements, psnLibrary } from './providers.mjs';

const origin = 'https://y33bau.github.io';
const allowed = { xbox: xboxLibrary, ps: psnLibrary };
const cached = new Map();
const jobs = new Map();

async function collect(provider) {
  const cachedResult = cached.get(provider);
  if (cachedResult && Date.now() - cachedResult.at < 60000) return cachedResult.data;
  if (!jobs.has(provider)) {
    jobs.set(provider, allowed[provider](process.env).then(result => {
      const data = { format: 'checkpoint-source-v1', provider, ...result };
      cached.set(provider, { at: Date.now(), data });
      return data;
    }).finally(() => jobs.delete(provider)));
  }
  return jobs.get(provider);
}

const exportProvider = process.argv[2];
if (exportProvider) {
  if (!Object.hasOwn(allowed, exportProvider)) throw Error('Choose xbox or ps');
  const output = 'checkpoint-' + exportProvider + '.json';
  try {
    await writeFile(output, JSON.stringify(await collect(exportProvider)), { flag: 'wx', mode: 0o600 });
    console.log('Export written to ' + output);
  } catch {
    console.error('Export failed. Check provider authorization and whether the output file already exists.');
    process.exitCode = 1;
  }
} else {
  const port = 43179;
  const host = '127.0.0.1:' + port;
  const secret = process.env.CHECKPOINT_BRIDGE_KEY || '';
  if (secret.length < 24) throw Error('Configure CHECKPOINT_BRIDGE_KEY with at least 24 random characters.');
  const expected = Buffer.from('Bearer ' + secret);
  createServer(async (request, response) => {
    const reply = (status, data) => {
      response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(data ? JSON.stringify(data) : '');
    };
    if (request.headers.host !== host || request.headers.origin !== origin) return reply(403);
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Authorization');
    response.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (request.method === 'OPTIONS') return reply(204);
    if (request.method !== 'GET') return reply(405);
    const provided = Buffer.from(request.headers.authorization || '');
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return reply(401);
    const provider = new URL(request.url, 'http://' + host).pathname.slice(1);
    const detail = /^xbox\/achievements\/(\d{1,12})$/.exec(provider);
    if(detail){
      const library=await collect('xbox').catch(()=>null);
      if(!library?.games.some(game=>game.id===detail[1]))return reply(404);
      try{return reply(200,{achievements:await xboxTitleAchievements(process.env,detail[1])})}
      catch{return reply(502,{error:'provider_unavailable'})}
    }
    if (!Object.hasOwn(allowed, provider)) return reply(404);
    try { reply(200, await collect(provider)); }
    catch { reply(502, { error: 'provider_unavailable' }); }
  }).listen(port, '127.0.0.1', () => {
    console.log('Checkpoint bridge: http://' + host);
  });
}
