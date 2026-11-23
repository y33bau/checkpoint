import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createIgdbLookup } from '../integrations/steam/igdb.mjs';
import worker from '../integrations/steam/worker.mjs';

const origin='https://y33bau.github.io';
const env={IGDB_CLIENT_ID:'test-app',IGDB_CLIENT_SECRET:'test-secret'};
const reply=(body,status=200)=>Response.json(body,{status});
const req=(params={})=>{
  const url=new URL('https://checkpoint.example/api/igdb/game');
  url.search=new URLSearchParams({title:'Hades',system:'Steam',...params});
  return new Request(url);
};
const hades={
  id:100,name:'Hades',slug:'hades',platforms:[6],cover:{image_id:'cover'},
  screenshots:[{image_id:'shot'}],aggregated_rating:93.7,aggregated_rating_count:24,
  rating:96,rating_count:42,
};

test('IGDB uses Steam identity first, normalizes results and reuses the server token',async()=>{
  const calls=[];
  const lookup=createIgdbLookup(async()=>false,async(url,init)=>{
    calls.push({url,init});
    if(url.includes('twitch.tv'))return reply({access_token:'private-token',expires_in:3600});
    if(url.endsWith('/external_games'))return reply([{game:hades}]);
    return reply([hades]);
  });
  const response=await lookup(req({steamId:'1145360'}),env,reply,origin);
  assert.deepEqual(await response.json(),{game:{
    id:100,slug:'hades',cover:'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/cover.jpg',
    hero:'https://images.igdb.com/igdb/image/upload/t_1080p/shot.jpg',
    critics:{value:94,count:24},players:{value:96,count:42},
  }});
  assert(calls[1].init.body.includes('external_game_source = 1 & uid = "1145360"'));
  assert.equal(calls[1].init.headers.Authorization,'Bearer private-token');
  await lookup(req(),env,reply,origin);
  assert.equal(calls.filter(call=>call.url.includes('twitch.tv')).length,1);
});

test('IGDB falls back to an exact title on the requested platform and rejects ambiguity',async()=>{
  const rows=[hades,{...hades,id:101,name:'Hades II',platforms:[130]},{...hades,id:102,platforms:[130]}];
  const lookup=createIgdbLookup(async()=>false,async url=>url.includes('twitch.tv')
    ?reply({access_token:'token',expires_in:3600}):reply(rows));
  assert.equal((await (await lookup(req({system:'Nintendo'}),env,reply,origin)).json()).game.id,102);
  rows.push({...hades,id:103,platforms:[130]});
  assert.deepEqual(await (await lookup(req({system:'Nintendo'}),env,reply,origin)).json(),{game:null});
});

test('IGDB validates requests, exposes readiness and rate limits the lookups',async()=>{
  const config={DB:{},APP_URLS:origin+'/checkpoint/'};
  const url='https://checkpoint.example/api/igdb/status';
  assert.deepEqual(await (await worker.fetch(new Request(url),config)).json(),{ready:false});
  assert.deepEqual(await (await worker.fetch(new Request(url),{...config,...env})).json(),{ready:true});
  const lookup=createIgdbLookup(async()=>true,()=>assert.fail('No upstream call expected'));
  assert.equal((await lookup(req(),env,reply,null)).status,403);
  assert.equal((await lookup(req(),{},reply,origin)).status,503);
  assert.equal((await lookup(req({steamId:'broken'}),env,reply,origin)).status,400);
  assert.equal((await lookup(req(),env,reply,origin)).status,429);
});

