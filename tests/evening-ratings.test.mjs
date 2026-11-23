import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';

const header='app_id,name,slug,release_date,is_free,total_positive,total_negative,health_tier';
const steamCsv=[
  header,
  '11,"A ""quoted"", game",a,2020-01-01,false,95,5,',
  '12,Twin,twin,2020-01-01,false,5,0,',
  '13,Twin,twin-two,2020-01-01,false,10,10,',
  '14,Unrated,unrated,2020-01-01,false,0,0,',
].join('\r\n');

function loadApp(globals={}) {
  const context=createContext({AbortSignal,...globals});
  for(const file of ['catalog.js','steam-ratings.js','metacritic.js','rating.js','play.js']){
    runInContext(readFileSync(new URL('../'+file,import.meta.url),'utf8'),context);
  }
  return context;
}

test('Steam ratings match by App ID and only use an unambiguous title fallback',()=>{
  const {parseSteamReviewSnapshot,findSteamReview}=loadApp();
  const index=parseSteamReviewSnapshot(steamCsv);
  assert.equal(findSteamReview(index,{title:'A "Quoted", Game'}).value,0.95);
  assert.equal(findSteamReview(index,{steamAppId:13,title:'Twin'}).reviews,20);
  assert.equal(findSteamReview(index,{steamId:13,title:'Twin'}).value,0.5);
  assert.equal(findSteamReview(index,{steamAppId:99,title:'A "Quoted", Game'}),undefined);
  assert.equal(findSteamReview(index,{title:'Twin'}),null);
  assert.equal(findSteamReview(index,{title:'Unrated'}),undefined);
  assert.throws(()=>parseSteamReviewSnapshot('<html>'),/Invalid Steam review snapshot/);
});

test('the evening draw ranks matching library games and keeps missing ratings last',()=>{
  const entry=(id,minutes,mood='action',platform='Steam')=>({
    id, system:platform, runs:{[platform]:{}}, sessionHint:{minutes,mood},
  });
  const games=[
    entry('unrated',15),entry('rated',30),entry('best',45),entry('tie-with-more-reviews',20),
    entry('too-long',180),entry('wrong-mood',15,'calm'),entry('wrong-platform',20,'action','Xbox'),
    {...entry('archived',10),archived:true},
  ];
  const ratings={
    rated:{value:0.9,reviews:10},
    best:{value:0.98,reviews:10},
    'tie-with-more-reviews':{value:0.98,reviews:200},
    'too-long':{value:1,reviews:300},
    'wrong-mood':{value:1,reviews:300},
    'wrong-platform':{value:1,reviews:300},
    archived:{value:1,reviews:300},
  };
  const {eveningPicks}=loadApp({games});
  const rate=game=>ratings[game.id];
  assert.deepEqual(Array.from(eveningPicks(30,'action','Steam',rate),pick=>pick.game.id),
    ['tie-with-more-reviews','best','rated']);
  assert.equal(eveningPicks(30,'action','Steam',game=>game.id==='rated'?rate(game):null)[0].game.id,'rated');
  assert.equal(eveningPicks(30,'action','Steam').length,3);
});

test('Metacritic ranking respects catalogue platform and version',async()=>{
  const csv='title,platform,date,critics,users,other\nOne,PC,2024,90,7.0,\nOne,Xbox Series X,2024,92,7.0,\nOne,Xbox One,2024,87,7.0,';
  const {eveningRatingLookup}=loadApp({fetch:async()=>({ok:true,text:async()=>csv})});
  const rate=await eveningRatingLookup('metacritic');
  assert.equal(rate({title:'One'},'Steam').value,90);
  assert.equal(rate({title:'One',versions:['Xbox One']},'Xbox').value,87);
  assert.equal(rate({title:'One',criticScores:{Xbox:{critics:80}}},'Xbox').value,80);
  assert.equal(rate({title:'One'},'PlayStation'),undefined);
});

test('the rated catalogue ranks the full draw pool before taking three results',async()=>{
  const entries=[
    {name:'Already owned',uuid:'10'},{name:'Low score',uuid:'11'},{name:'Unrated',uuid:'12'},
    {name:'Excellent',uuid:'13'},{name:'Great',uuid:'14'},{name:'Good',uuid:'15'},
  ];
  const values={10:100,11:1,13:99,14:95,15:80};
  const {drawCatalogueGames}=loadApp({
    games:[{title:'Already owned'}],web:value=>value,fetch:async()=>({ok:true,json:async()=>entries}),
  });
  const choices=await drawCatalogueGames('Steam',item=>values[item.steamId]&&{value:values[item.steamId]});
  assert.deepEqual(Array.from(choices,item=>item.title),['Excellent','Great','Good']);
});
