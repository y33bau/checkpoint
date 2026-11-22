function needsOnboarding(settings) {
  return !settings.onboarded && !settings.language;
}

function finishOnboarding(language) {
  preferences.language=language;
  preferences.onboarded=true;
  savePreferences();
  document.querySelector('#first-run').close();
  applyLanguage();
  render();
}

function openOnboarding() {
  if(!needsOnboarding(preferences))return;
  const modal=document.querySelector('#first-run');
  const form=modal.querySelector('form');
  let language='pl';
  function paint() {
    const label=key=>language==='en' && Object.hasOwn(english,key)?english[key]:key;
    form.lang=language;
    form.innerHTML='<h2 id="first-run-title">'+label('Zacznij z Checkpointem')+'</h2>'+
      '<label>'+label('Język aplikacji')+'<select name="language">'+
      '<option value="pl" '+(language==='pl'?'selected':'')+'>Polski</option>'+
      '<option value="en" '+(language==='en'?'selected':'')+'>English</option></select></label>'+
      '<button class="primary" type="submit">'+label('Rozpocznij')+'</button>';
    form.elements.language.onchange=event=>{
      language=event.target.value;
      paint();
      form.elements.language.focus();
    };
    form.onsubmit=event=>{event.preventDefault();finishOnboarding(language)};
  }

  modal.addEventListener('cancel',event=>event.preventDefault());
  paint();
  modal.showModal();
}
