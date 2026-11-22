function needsOnboarding(settings) {
  return !settings.onboarded && !settings.language && !settings.weather;
}

function finishOnboarding(language,place) {
  preferences.language=language;
  preferences.onboarded=true;
  if(place)preferences.weather=place;
  savePreferences();
  document.querySelector('#first-run').close();
  applyLanguage();
  render();
  loadWeather();
}

function openOnboarding() {
  if(!needsOnboarding(preferences))return;
  const modal=document.querySelector('#first-run');
  const form=modal.querySelector('form');
  let language='pl';
  let place=null;
  let revision=0;

  function paint() {
    const label=key=>language==='en' && Object.hasOwn(english,key)?english[key]:key;
    const defaultPlace=weatherDefault(language);
    form.lang=language;
    form.innerHTML='<h2 id="first-run-title">'+label('Zacznij z Checkpointem')+'</h2>'+
      '<label>'+label('Język aplikacji')+'<select name="language">'+
      '<option value="pl" '+(language==='pl'?'selected':'')+'>Polski</option>'+
      '<option value="en" '+(language==='en'?'selected':'')+'>English</option></select></label>'+
      '<fieldset class="onboarding-location"><legend>'+label('Lokalizacja pogody')+'</legend>'+
      '<p>'+label('Domyślna miejscowość')+' <strong>'+esc(defaultPlace.name)+'</strong></p>'+
      '<label>'+label('Nazwa miejscowości')+'<input name="city" maxlength="80" autocomplete="off"></label>'+
      '<div class="actions"><button type="button" data-city-search>'+label('Szukaj')+'</button>'+
      '<button type="button" data-device-location>'+label('Użyj mojej lokalizacji')+'</button></div>'+
      '<p class="muted" data-onboarding-status role="status"></p><div data-city-choices></div></fieldset>'+
      '<div class="actions"><button class="primary" type="submit">'+label('Rozpocznij')+'</button>'+
      '<button type="button" data-use-default>'+label('Użyj domyślnej miejscowości')+'</button></div>';
    const status=form.querySelector('[data-onboarding-status]');
    const choices=form.querySelector('[data-city-choices]');
    const city=form.elements.city;

    function choose(location) {
      place=location;
      city.value='';
      choices.replaceChildren();
      status.textContent=label('Wybrana lokalizacja')+' · '+(place.device?label('Moja lokalizacja'):place.name);
    }

    form.elements.language.onchange=event=>{
      language=event.target.value;
      revision++;
      paint();
      form.elements.language.focus();
    };
    if(place)choose(place);

    async function search() {
      const query=city.value.trim();
      const ticket=++revision;
      choices.replaceChildren();
      if(query.length<2){status.textContent=label('Wpisz co najmniej dwie litery.');return}
      status.textContent=label('Szukam miejscowości…');
      try {
        const cities=await lookupWeatherCities(query,language);
        if(ticket!==revision || !modal.open)return;
        status.textContent=cities.length?'':label('Brak wyników. Spróbuj innej nazwy.');
        for(const entry of cities){
          const button=document.createElement('button');
          button.type='button';
          button.className='city-choice';
          button.textContent=[entry.name,entry.admin1,entry.country].filter(Boolean).join(' · ');
          button.onclick=()=>choose(weatherPlace(entry));
          choices.append(button);
        }
      }catch{
        if(ticket===revision && modal.open)status.textContent=label('Nie udało się wyszukać miejscowości.');
      }
    }

    form.querySelector('[data-city-search]').onclick=search;
    city.onkeydown=event=>{
      if(event.key==='Enter'&&!event.isComposing){event.preventDefault();search()}
    };
    const locate=form.querySelector('[data-device-location]');
    locate.disabled=!navigator.geolocation;
    locate.onclick=()=>{
      const ticket=++revision;
      choices.replaceChildren();
      status.textContent=label('Sprawdzam lokalizację…');
      navigator.geolocation.getCurrentPosition(position=>{
        if(ticket!==revision || !modal.open)return;
        choose({device:true,latitude:position.coords.latitude,longitude:position.coords.longitude});
      },()=>{
        if(ticket===revision && modal.open)status.textContent=label('Nie udało się pobrać lokalizacji. Wybierz miasto lub użyj domyślnego.');
      },{timeout:8000,maximumAge:300000});
    };
    form.querySelector('[data-use-default]').onclick=()=>{revision++;finishOnboarding(language,null)};
    form.onsubmit=event=>{
      event.preventDefault();
      if(city.value.trim()){search();return}
      revision++;
      finishOnboarding(language,place);
    };
  }

  modal.addEventListener('cancel',event=>event.preventDefault());
  paint();
  modal.showModal();
}
