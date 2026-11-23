import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {test} from 'node:test';

function loadApp(globals={}) {
  const context=createContext({
    URL, AbortSignal, appLocale:()=> 'pl',
    web(value){
      try {
        const url=new URL(value);
        return ['https:','http:'].includes(url.protocol)?url.href:'';
      }catch{return ''}
    },
    ...globals,
  });
  for(const file of ['catalog.js','metacritic.js','rating.js','play.js','game-picker.js','game-resources.js','match-maps.js']){
    runInContext(readFileSync(new URL('../'+file,import.meta.url),'utf8'),context);
  }
  return context;
}

test('evening filters select the queue or playing status, genre and rated games before taking a page',()=>{
  const make=(title,properties)=>({
    title, system:'Steam', runs:{Steam:{}}, genre:'Akcja', sessionHint:{minutes:20}, ...properties,
  });
  const games=[
    make('Queued and rated',{pinnedAt:1,rating:92}),
    make('Queued but unrated',{pinnedAt:1}),
    make('Queued in another genre',{pinnedAt:1,genre:'RPG',rating:100}),
    make('Playing',{status:'Gram',rating:90}),
    make('Archived',{archived:true,pinnedAt:1,rating:99}),
  ];
  const {eveningPicks}=loadApp({games});
  const rate=game=>game.rating&&{value:game.rating};
  const titles=rows=>Array.from(rows,row=>row.game.title);
  assert.deepEqual(titles(eveningPicks(60,'','Steam',rate,{scope:'queue',genre:'Akcja',ratedOnly:true})),['Queued and rated']);
  assert.deepEqual(titles(eveningPicks(60,'','Steam',rate,{scope:'playing'})),['Playing']);
});

test('a game on another platform reuses the same library entry and leaves its original save intact',()=>{
  const original={progress:34,sessions:[]};
  const entry={id:'g',title:'Hades',system:'Xbox',runs:{Xbox:original},cover:'cover',status:'W kolejce'};
  const games=[entry];
  const settings={};
  const {placeCatalogueGame}=loadApp({
    games,preferences:settings,savePreferences(){},run:()=>({progress:0,sessions:[]}),attachCriticScores(){},
  });
  const choice={title:'Hades',store:'Steam',steamId:1145360,versions:[]};
  assert.equal(placeCatalogueGame('queue',choice,'Steam'),entry);
  assert.equal(games.length,1);
  assert.equal(entry.runs.Xbox,original);
  assert.equal(entry.system,'Xbox');
  assert.equal(entry.runs.Steam.progress,0);
  assert(entry.pinnedAt);
  placeCatalogueGame('playing',choice,'Steam');
  assert.equal(entry.system,'Steam');
  assert.equal(settings.featuredGameId,'g');
});

test('bulk paste deduplicates links without mixing the imported map and guide lists',()=>{
  const {pastedResources,addPickedResources}=loadApp();
  const game={maps:[{url:'https://wand.com/pl/maps/elden-ring/lands-between'}]};
  const entries=pastedResources([
    'https://wand.com/maps/elden-ring/lands-between',
    'https://www.youtube.com/watch?v=guide&t=25&utm_source=example',
    'https://youtu.be/guide?si=share&t=25',
    'https://youtu.be/guide?t=30',
  ].join('\n'));
  assert.equal(entries.length,3);
  assert.equal(addPickedResources(game,entries,'Margit'),2);
  assert.equal(game.maps.length,1);
  assert.equal(game.guides.length,2);
  assert.equal(game.guides[0].goal,'Margit');
  assert.equal(addPickedResources(game,entries,'Margit'),0);
});

test('map packs support unique imports and prioritize the last opened map and favorites',()=>{
  const {catalogMatchMaps,addMatchMaps,prioritizedMatchMaps}=loadApp();
  const game={title:'Counter-Strike 2',steamAppId:730};
  const pack=catalogMatchMaps(game);
  const mirage=pack.find(map=>map.id==='cs2-mirage');
  addMatchMaps(game,[mirage]);
  game.matchMaps[0].favorite=true;
  game.matchMaps[0].notes='Mid';
  addMatchMaps(game,pack);
  game.lastMatchMap='cs2-office';
  const maps=prioritizedMatchMaps(game);
  assert.equal(maps.length,pack.length);
  assert.equal(maps[0].id,'cs2-office');
  assert.equal(maps[1].id,'cs2-mirage');
  assert.equal(maps[1].notes,'Mid');
  assert.equal(prioritizedMatchMaps(game,'hostage').length,1);
  assert.equal(catalogMatchMaps({title:'ARC Raiders'}).length,6);
});
