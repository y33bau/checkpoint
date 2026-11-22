const statuses = ['W trakcie', 'Do ogrania', 'Ukończone'];
const games = [
  ['BioShock',7670,'Xbox',0,'#286f75'],['Hades',1145360,'Steam',0,'#ab434e'],
  ['Hollow Knight',367520,'Nintendo',1,'#495d85'],['Control',870780,'PlayStation',2,'#a24246'],
  ['Disco Elysium',632470,'Steam',1,'#956656'],['Portal 2',620,'Steam',2,'#427a9a'],
  ['Celeste',504230,'Nintendo',1,'#715a95'],['Elden Ring',1245620,'Xbox',0,'#84763e'],
  ['Death Stranding',1850570,'PlayStation',1,'#526677'],['DOOM Eternal',782330,'Xbox',2,'#904a3a'],
  ['Outer Wilds',753640,'Steam',1,'#9b6550'],['Balatro',2379780,'Nintendo',0,'#356f65']
].map(([title,id,platform,status,tone])=>({title,id,platform,status,tone}));
let query='', platform='', selectedGame;
const detail=document.querySelector('#detail');
const choice=detail.querySelector('select');
choice.innerHTML=statuses.map((s,i)=>'<option value="'+i+'">'+s+'</option>').join('');
function gameTile(g){
  const initials=g.title.split(' ').map(w=>w[0]).slice(0,2).join('');
  return '<button class="game" data-id="'+g.id+'"><span class="art" aria-hidden="true" style="--tone:'+g.tone+'">'+initials+'<img alt="" loading="lazy" src="https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/'+g.id+'/header.jpg"></span><span class="copy"><strong>'+g.title+'</strong><small>'+g.platform+' · '+statuses[g.status]+'</small></span></button>';
}
function filtered(){return games.filter(g=>(!platform||g.platform===platform)&&g.title.toLowerCase().includes(query.trim().toLowerCase()));}
function results(mode){
  const list=filtered();
  if(!list.length)return '<p class="none">Brak pasujących gier.</p>';
  if(mode==='groups')return statuses.map((status,i)=>{
    const group=list.filter(g=>g.status===i);
    return group.length?'<details '+(query||platform||i===0?'open':'')+'><summary>'+status+'<span>'+group.length+'</span></summary><div class="games">'+group.map(gameTile).join('')+'</div></details>':'';
  }).join('');
  const ordered=mode==='index'?[...list].sort((a,b)=>a.title.localeCompare(b.title,'pl')):list;
  return '<div class="games">'+ordered.map(gameTile).join('')+'</div>';
}
function library(mode){
  return '<section class="'+mode+'"><div class="head"><h1>Biblioteka</h1><span class="count" role="status">'+filtered().length+' / '+games.length+' gier</span></div><div class="tools"><input type="search" aria-label="Szukaj gry" placeholder="Szukaj gry"><select aria-label="Platforma"><option value="">Wszystkie platformy</option>'+['Steam','Xbox','PlayStation','Nintendo'].map(s=>'<option '+(platform===s?'selected':'')+'>'+s+'</option>').join('')+'</select></div><div id="results" class="'+(mode==='groups'?'groups':'')+'">'+results(mode)+'</div></section>';
}
const variants=['shelf','index','groups'].map(mode=>()=>{query='';return library(mode)});
function refresh(){
  const section=document.querySelector('#stage section');
  section.querySelector('#results').innerHTML=results(section.className);
  section.querySelector('.count').textContent=filtered().length+' / '+games.length+' gier';
}
document.addEventListener('error',e=>{if(e.target.matches?.('.art img'))e.target.remove()},true);
document.addEventListener('input',e=>{if(e.target.type==='search'){query=e.target.value;refresh()}});
document.addEventListener('change',e=>{
  if(e.target.matches('.tools select')){platform=e.target.value;refresh()}
  if(e.target===choice){selectedGame.status=Number(choice.value);refresh()}
});
document.addEventListener('click',e=>{
  const button=e.target.closest('[data-id]');
  if(!button)return;
  selectedGame=games.find(g=>g.id===Number(button.dataset.id));
  detail.querySelector('h2').textContent=selectedGame.title;
  detail.querySelector('p').textContent=selectedGame.platform;
  choice.value=selectedGame.status;
  detail.showModal();
});
