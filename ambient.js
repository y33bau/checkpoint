const ambientDuration=40;
const ambientButton=document.querySelector('#ambient-toggle');
let ambientContext,ambientOutput,ambientSource,ambientJob,ambientPauseTimer;

function renderAmbientTrack() {
  const sampleRate=24000;
  const Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext;
  const track=new Offline(2,sampleRate*ambientDuration,sampleRate);
  const chords=[[45,52,57,60,64],[41,48,55,57,64],[48,55,59,64,67],[43,50,57,62,69]];
  const beat=ambientDuration/chords.length;
  for(const [chordIndex,notes] of chords.entries()){
    for(const [index,note] of notes.entries()){
      const oscillator=track.createOscillator();
      const gain=track.createGain();
      const frequency=432*2**((note-69)/12);
      // Give each voice an integer number of cycles over the buffer for a continuous loop.
      oscillator.frequency.value=Math.round(frequency*ambientDuration)/ambientDuration;
      const level=[.09,.032,.025,.021,.014][index];
      const envelope=Float32Array.from({length:513},(_,step)=>{
        const time=ambientDuration*step/512;
        const phase=(time-chordIndex*beat+2+ambientDuration)%ambientDuration;
        const swell=phase<beat+4?Math.sin(Math.PI*phase/(beat+4))**2:0;
        return level*swell*(.84+.16*Math.cos(2*Math.PI*(time/ambientDuration+index/7)));
      });
      gain.gain.setValueCurveAtTime(envelope,0,ambientDuration);
      oscillator.connect(gain);
      if(track.createStereoPanner){
        const stereo=track.createStereoPanner();
        stereo.pan.value=[0,-.32,.31,-.16,.21][index];
        gain.connect(stereo).connect(track.destination);
      }else gain.connect(track.destination);
      oscillator.start();
    }
  }
  return track.startRendering();
}

function paintAmbient() {
  ambientButton.setAttribute('aria-pressed',String(preferences.ambientEnabled===true));
}

function adjustAmbient() {
  paintAmbient();
  if(!ambientOutput)return;
  const now=ambientContext.currentTime;
  const volume=preferences.ambientEnabled&&!['pending','recording'].includes(recording?.state)?0.55:0;
  ambientOutput.gain.setTargetAtTime(volume,now,.08);
  clearTimeout(ambientPauseTimer);
  if(!preferences.ambientEnabled){
    ambientPauseTimer=setTimeout(()=>{
      if(!preferences.ambientEnabled&&ambientContext.state==='running')ambientContext.suspend().catch(()=>{});
    },450);
  }
}

async function startAmbient() {
  const Audio=window.AudioContext||window.webkitAudioContext;
  ambientContext??=new Audio();
  const running=ambientContext.resume();
  if(!ambientOutput){
    ambientOutput=ambientContext.createGain();
    ambientOutput.gain.value=0;
    ambientOutput.connect(ambientContext.destination);
  }
  ambientJob??=renderAmbientTrack().catch(error=>{ambientJob=undefined;throw error});
  const [buffer]=await Promise.all([ambientJob,running]);
  if(!ambientSource){
    ambientSource=ambientContext.createBufferSource();
    ambientSource.buffer=buffer;
    ambientSource.loop=true;
    ambientSource.connect(ambientOutput);
    ambientSource.start();
  }
  adjustAmbient();
}

function initializeAmbient() {
  if(!(window.AudioContext||window.webkitAudioContext)||!(window.OfflineAudioContext||window.webkitOfflineAudioContext)){
    ambientButton.hidden=true;
    return;
  }
  const play=()=>startAmbient().catch(()=>{
    preferences.ambientEnabled=false;
    savePreferences();
    adjustAmbient();
  });
  paintAmbient();
  ambientButton.onclick=()=>{
    preferences.ambientEnabled=!preferences.ambientEnabled;
    savePreferences();
    adjustAmbient();
    if(preferences.ambientEnabled)play();
  };
  if(preferences.ambientEnabled){
    document.addEventListener('click',event=>{
      if(!event.target.closest('#ambient-toggle')&&preferences.ambientEnabled)play();
    },{once:true,capture:true});
  }
}
