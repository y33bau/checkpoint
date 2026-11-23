const steamReviewProject='https://thegamecensus.com/data';
const steamReviewSnapshots=[
  'https://raw.githubusercontent.com/y33bau/checkpoint/news-data/steam-reviews.csv',
  'https://thegamecensus.com/data/games-index.csv',
];
let steamReviewIndexPromise;

function parseSteamReviewSnapshot(csv) {
  const byId=new Map();
  const byTitle=new Map();
  const lines=csv.trimStart().split(/\r?\n/);
  if(!lines[0].startsWith('app_id,name,slug,release_date,is_free,total_positive,total_negative,')){
    throw Error('Invalid Steam review snapshot');
  }
  const fields=/^(\d+),("(?:[^"]|"")*"|[^,]*),[^,]*,[^,]*,[^,]*,(\d+),(\d+),/;
  for(const line of lines.slice(1)){
    const match=fields.exec(line);
    if(!match)continue;
    const [,id,name,positive,negative]=match;
    const reviews=Number(positive)+Number(negative);
    if(!Number.isSafeInteger(reviews)||reviews===0)continue;
    const title=name.replace(/^"|"$/g,'').replaceAll('""','"');
    const rating={value:Number(positive)/reviews,reviews,title,id:Number(id)};
    byId.set(rating.id,rating);
    const key=catalogText(title);
    if(key)byTitle.set(key,byTitle.has(key)?null:rating);
  }
  if(!byId.size)throw Error('Empty Steam review snapshot');
  return {byId,byTitle};
}

function steamReviewIndex() {
  if(!steamReviewIndexPromise){
    steamReviewIndexPromise=(async()=>{
      for(const url of steamReviewSnapshots){
        try {
          const response=await fetch(url,{signal:AbortSignal.timeout(7000)});
          if(response.ok)return parseSteamReviewSnapshot(await response.text());
        }catch{ continue; }
      }
      throw Error('Steam review snapshot unavailable');
    })().catch(error=>{steamReviewIndexPromise=null;throw error});
  }
  return steamReviewIndexPromise;
}

function findSteamReview(index,game) {
  const id=game.steamAppId||game.steamId;
  return id?index.byId.get(Number(id)):index.byTitle.get(catalogText(game.title));
}
