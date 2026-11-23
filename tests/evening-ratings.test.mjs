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

test('Metacritic ranking respects catalogue platform and version',()=>{
  const csv='title,platform,date,critics,users,other\nOne,PC,2024,90,7.0,\nOne,Xbox Series X,2024,92,7.0,\nOne,Xbox One,2024,87,7.0,';
  const {eveningRatingLookup,parseCriticSnapshot}=loadApp();
  const rate=eveningRatingLookup({critics:parseCriticSnapshot(csv)},'metacritic');
  assert.equal(rate({title:'One'},'Steam').value,90);
  assert.equal(rate({title:'One',versions:['Xbox One']},'Xbox').value,87);
  assert.equal(rate({title:'One',criticScores:{Xbox:{critics:89}}},'Xbox').value,89);
  assert.equal(rate({title:'One'},'PlayStation'),undefined);
});

test('global ranking includes owned titles and preserves platform and genre filters',()=>{
  const {rankedCatalogueGames,parseSteamReviewSnapshot,parseCriticSnapshot}=loadApp({
    games:[{title:'Already owned'}],cdn:id=>'cover/'+id,
  });
  const steam=parseSteamReviewSnapshot([
    header,
    '1,Small release,small,2020-01-01,false,20,0,',
    '2,Known Hit,hit,2020-01-01,false,19600,400,',
    '3,Popular Indie,indie,2020-01-01,false,9700,300,',
    '4,Already owned,saved,2020-01-01,false,99000,1000,',
    '5,Divisive,div,2020-01-01,false,99000,12000,',
  ].join('\n'));
  const critics=parseCriticSnapshot([
    'title,platform,date,critics,users,other',
    'Known Hit,PC,2024,96,8.0,',
    'Known Hit,Xbox Series X,2024,95,8.0,',
    'Console Hit,PlayStation 5,2024,92,8.0,',
    'Small release,PC,2024,78,9.0,',
    'Classic,PC,2024,92,8.0,',
  ].join('\n'));
  const genres=new Map([
    ['known hit',new Map([['PC','RPG'],['Xbox Series X','RPG']])],
    ['console hit',new Map([['PlayStation 5','Akcja']])],
  ]);
  const data={steam,critics,genres};
  const titles=results=>Array.from(results,result=>result.title);
  assert.deepEqual(titles(rankedCatalogueGames(data,'','','default')),
    ['Known Hit','Already owned','Popular Indie','Classic','Console Hit']);
  assert.deepEqual(titles(rankedCatalogueGames(data,'Xbox','RPG','default')),['Known Hit']);
  assert.deepEqual(titles(rankedCatalogueGames(data,'Steam','','default')),['Known Hit','Already owned','Popular Indie']);
  assert.deepEqual(titles(rankedCatalogueGames({critics},'PlayStation','','default')),['Console Hit']);
  assert.deepEqual(titles(rankedCatalogueGames({steam},'','','steam')),['Already owned','Known Hit','Popular Indie']);
});

test('global recommendations rerank every time preset and keep the unrestricted quality order',()=>{
  const {rankedCatalogueGames}=loadApp({cdn:id=>'cover/'+id});
  const entries=[
    ['Racing pick','Wyścigi',92], ['Action pick','Akcja',91], ['Role-playing pick','RPG',90],
    ['Strategy pick','Strategie',89], ['No session estimate','',98],
  ];
  const critics=new Map(entries.map(([title,,critics])=>[
    title.toLowerCase().replace(/-/g,' '),new Map([['PC',{title,critics}]]),
  ]));
  const genres=new Map(entries.map(([title,genre])=>[
    title.toLowerCase().replace(/-/g,' '),new Map([['PC',genre]]),
  ]));
  const picks=[30,60,120,180,null].map(minutes=>
    rankedCatalogueGames({critics,genres},'','','default',{minutes})[0].title);
  assert.deepEqual(picks,['Racing pick','Action pick','Role-playing pick','Strategy pick','No session estimate']);
  assert.equal(rankedCatalogueGames({critics,genres},'','Strategie','default',{minutes:30})[0].title,'Strategy pick');
});
