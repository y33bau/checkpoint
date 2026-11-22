const valueLevels = {
  10:'Dokładnie tego szukam',
  8:'Daje mi coś konkretnego',
  5:'Może być',
  2:'Zapychacz',
  1:'Szkoda mojego czasu',
};
const fitLevels = {
  10:'Spokojnie zrobię postęp',
  7:'Zmieszczę krótką sesję',
  4:'Poczuję pośpiech',
  1:'Odłożę na inny dzień',
};
const startPreviews = new Map();

function calculateStartScore(m,v,timing) {
  if(!Number.isInteger(m)||m<1||m>100||!Number.isInteger(v)||!Object.hasOwn(valueLevels,v)||!Number.isInteger(timing)||!Object.hasOwn(fitLevels,timing))return null;
  const cents=Math.round((m*7+v*110+timing*20)/4);
  return {value:cents/100,verdict:cents>=400?'Graj':cents>=300?'Rozważ':'Odpuść',tier:cents>=400?'play':cents>=300?'consider':'skip'};
}

function scoreForSession(game,platform,timing) {
  return calculateStartScore(game.startRating?.metacritic?.[platform],game.startRating?.value,timing);
}

function estimateTimeFit(available,typical) {
  if(!Number.isFinite(typical)||typical<=0||!Number.isFinite(available)||available<=0)return null;
  const ratio=available/typical;
  return ratio>=1?10:ratio>=.75?7:ratio>=.5?4:1;
}

function startBadge(score) {
  const number=score.value.toLocaleString(appLocale(),{minimumFractionDigits:2,maximumFractionDigits:2});
  return '<span class="start-badge '+score.tier+'"><strong>'+number+' / 5</strong><span>'+t(score.verdict)+'</span></span>';
}

function startResult(game,timing) {
  const score=scoreForSession(game,game.system,timing);
  if(score)return startBadge(score);
  if(!game.startRating?.metacritic?.[game.system] || !game.startRating?.value)
    return '<p class="muted">'+t('Brak danych do pełnego wyniku.')+'</p>';
  return '<p class="muted">'+t('Wybierz dopasowanie czasu, aby zobaczyć wynik.')+'</p>';
}

function levelOptions(levels,selected) {
  return Object.keys(levels).reverse().map(key=>
    '<option value="'+key+'" '+(Number(key)===selected?'selected':'')+'>'+key+' · '+t(levels[key])+'</option>').join('');
}

function startRatingPanel(game) {
  const timing=startPreviews.get(game.id);
  const metacritic=game.startRating?.metacritic?.[game.system];
  const personal=game.startRating?.value;
  return '<section class="panel feature-panel start-rating"><div class="row"><h2>'+t('Czy warto zacząć?')+'</h2>'+
    btn(t('Ustaw ocenę startową'),'edit-start')+'</div>'+
    '<div class="start-metrics"><div><small>Metacritic · '+esc(game.system)+'</small><strong>'+esc(metacritic??'—')+' / 100</strong></div>'+
    '<div><small>'+t('Wartość dla mnie')+'</small><strong>'+esc(personal??'—')+' / 10</strong></div></div>'+
    '<label>'+t('Dopasowanie do sesji')+'<select id="start-preview-time"><option value="">'+t('Wybierz do podglądu')+
    '</option>'+levelOptions(fitLevels,timing)+'</select></label><div id="start-result" aria-live="polite">'+startResult(game,timing)+'</div>'+
    '<details><summary>'+t('Jak to działa?')+'</summary><p>'+t('Wpisz Metacritic dla swojej platformy. Oceń, ile ta gra daje Ci tego, czego szukasz: frajdy, relaksu, historii albo wyzwania. Na koniec wybierz, czy w dostępnym czasie zdążysz zrobić sensowny postęp.')+'</p>'+
    '<p>'+t('Wagi: Metacritic 35%, Wartość 55%, czas 10%. Od 4,00 — Graj. Od 3,00 — Rozważ. Poniżej 3,00 — Odpuść.')+'</p>'+
    '<p>'+t('W „Mam 45 minut” dopasowanie liczymy z typowej długości sesji ustawionej na karcie gry. Podgląd czasu na tej karcie jest tymczasowy.')+'</p></details></section>';
}

function editStartRating(game) {
  const platform=game.system;
  const rating=game.startRating || {};
  openForm(t('Czy warto zacząć?'),
    input('Metacritic · '+platform,'metacritic',rating.metacritic?.[platform],'type="number" min="1" max="100" step="1"')+
    '<label>'+t('Wartość dla mnie')+'<select name="personal"><option value="">'+t('Wybierz wartość')+
    '</option>'+levelOptions(valueLevels,rating.value)+'</select></label>',data=>{
    const metacritic=Number(data.get('metacritic'));
    const value=Number(data.get('personal'));
    game.startRating={metacritic:{...rating.metacritic},value:Object.hasOwn(valueLevels,value)?value:null};
    if(Number.isInteger(metacritic)&&metacritic>=1&&metacritic<=100)game.startRating.metacritic[platform]=metacritic;
    else delete game.startRating.metacritic[platform];
  });
}

function changeStartPreview(game,value) {
  if(!game)return;
  const timing=Number(value);
  if(Object.hasOwn(fitLevels,timing))startPreviews.set(game.id,timing);
  else startPreviews.delete(game.id);
  document.querySelector('#start-result').innerHTML=startResult(game,startPreviews.get(game.id));
}
