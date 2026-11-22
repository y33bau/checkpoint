let mediaDatabase;
let recording;
let mediaUrls = [];
let mediaPaint = 0;
let deviceBusy = false;

function openMediaDatabase() {
  if (!mediaDatabase) {
    mediaDatabase = new Promise((resolve,reject)=>{
      const request = indexedDB.open('checkpoint-media',2);
      request.onupgradeneeded=()=>{
        const store=request.result.objectStoreNames.contains('attachments')
          ? request.transaction.objectStore('attachments')
          : request.result.createObjectStore('attachments',{keyPath:'id'});
        store.createIndex('gameId','gameId');
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(Error('Media database blocked'));
    }).catch(error=>{mediaDatabase=null;throw error});
  }
  return mediaDatabase;
}

async function mediaTransaction(mode, operation) {
  const db=await openMediaDatabase();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction('attachments',mode);
    const request=operation(transaction.objectStore('attachments'));
    transaction.oncomplete=()=>resolve(request?.result);
    transaction.onabort=()=>reject(transaction.error);
    transaction.onerror=()=>reject(transaction.error);
  });
}

const allMedia=()=>mediaTransaction('readonly',store=>store.getAll());
const gameMedia=id=>mediaTransaction('readonly',store=>store.index('gameId').getAll(id));
const saveMedia=item=>mediaTransaction('readwrite',store=>store.put(item));
function replaceMedia(items) {
  return mediaTransaction('readwrite',store=>{
    store.clear();
    for(const item of items) store.put(item);
  });
}

function mediaStatus(label) {
  const status=document.querySelector('#media-status');
  if(status) status.textContent=t(label);
  const sessionStatus=dialog.open&&fields.querySelector('[data-session-media-status]');
  if(sessionStatus)sessionStatus.textContent=t(label);
}

function voiceLabel() {
  const state=recording?.state;
  return state==='recording'?'Zatrzymaj i zapisz':state==='saving'?'Zapisuję nagranie…':state?'Przygotowuję mikrofon…':'Nagraj notatkę';
}

function voiceButton() {
  const state=recording?.state;
  return '<button type="button" class="voice-button" data-act="voice-toggle"'+(state && state!=='recording'?' disabled':'')+'>'+t(voiceLabel())+'</button>';
}

function voicePanel() {
  return '<section class="panel feature-panel"><h2>'+t('Notatki głosowe')+'</h2><div class="actions">'+voiceButton()+'</div>'+
    '<p id="media-status" role="status"></p><div id="voice-list"></div></section>';
}

async function paintMedia(game) {
  const ticket=++mediaPaint;
  for(const url of mediaUrls) URL.revokeObjectURL(url);
  mediaUrls=[];
  if(!game) return;
  const latest=document.querySelector('#featured-voice');
  const list=document.querySelector('#voice-list');
  const screenshot=document.querySelector('#chronicle-screenshot');
  try {
    const media=await gameMedia(game.id);
    if(ticket!==mediaPaint)return;
    const voices=media.filter(item=>item.kind==='voice').sort((a,b)=>b.created-a.created);
    if(latest&&voices.length){
      const url=URL.createObjectURL(voices[0].blob);
      mediaUrls.push(url);
      latest.innerHTML='<details><summary>'+t('Odsłuchaj ostatnią notatkę')+'</summary><audio controls preload="none" src="'+esc(url)+'"></audio></details>';
    }
    if(list) list.innerHTML=voices.map(item=>{
      const url=URL.createObjectURL(item.blob);mediaUrls.push(url);
      return '<div class="voice-row"><small>'+esc(new Date(item.created).toLocaleString(appLocale()))+'</small>'+
        '<audio controls preload="none" src="'+esc(url)+'"></audio>'+
        '<button data-act="voice-remove:'+esc(item.id)+'">'+t('Usuń')+'</button></div>';
    }).join('') || '<p class="muted">'+t('Brak nagrań.')+'</p>';
    const shot=media.find(item=>item.kind==='screenshot');
    if(screenshot && shot){
      const url=URL.createObjectURL(shot.blob);mediaUrls.push(url);
      screenshot.innerHTML='<img src="'+esc(url)+'" alt="'+t('Zrzut ekranu')+'"><button data-act="chronicle-remove-shot">'+t('Usuń zrzut')+'</button>';
    }
  } catch {
    if(ticket===mediaPaint) mediaStatus('Zapis mediów jest niedostępny.');
  }
}

async function toggleVoice(game) {
  if(!game || deviceBusy) return;
  if(recording) {
    if(recording.state==='recording') {recording.state='saving';recording.recorder.stop();render()}
    return;
  }
  if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return mediaStatus('Nagrywanie jest niedostępne w tej przeglądarce.');
  const entry={gameId:game.id,state:'pending'};
  recording=entry;
  render();
  let stream;
  try {
    stream=await navigator.mediaDevices.getUserMedia({audio:true});
    if(recording!==entry){stream.getTracks().forEach(track=>track.stop());return}
    const type=['audio/mp4','audio/webm;codecs=opus','audio/webm'].find(value=>MediaRecorder.isTypeSupported?.(value));
    const recorder=new MediaRecorder(stream,type?{mimeType:type}:undefined);
    const parts=[];
    entry.recorder=recorder;
    entry.stream=stream;
    recorder.ondataavailable=event=>{if(event.data.size) parts.push(event.data)};
    recorder.onstop=async()=>{
      clearTimeout(entry.timer);
      stream.getTracks().forEach(track=>track.stop());
      if(recording!==entry)return;
      let message='Notatka głosowa zapisana.';
      try {
        const blob=new Blob(parts,{type:recorder.mimeType || parts[0]?.type || 'audio/webm'});
        if(!blob.size)throw Error('No audio');
        await saveMedia({id:crypto.randomUUID(),gameId:entry.gameId,kind:'voice',created:Date.now(),blob});
      } catch {
        message='Nie udało się zapisać nagrania.';
      }
      if(recording!==entry)return;
      recording=null;
      render();
      mediaStatus(message);
    };
    recorder.onerror=()=>{
      clearTimeout(entry.timer);
      stream.getTracks().forEach(track=>track.stop());
      recording=null;
      render();
      mediaStatus('Nie udało się zapisać nagrania.');
    };
    recorder.start();
    entry.state='recording';
    entry.timer=setTimeout(()=>{if(recorder.state==='recording'){entry.state='saving';recorder.stop();render()}},120000);
    render();
    mediaStatus('Nagrywanie… maksymalnie 2 minuty.');
  } catch {
    stream?.getTracks().forEach(track=>track.stop());
    if(recording===entry)recording=null;
    render();
    mediaStatus('Sprawdź dostęp do mikrofonu.');
  }
}

async function removeAttachment(id,kind,game) {
  if(!game || deviceBusy || !window.confirm(t('Usunąć załącznik?')))return;
  try {
    const media=await gameMedia(game.id);
    const item=media.find(row=>row.gameId===game.id && row.kind===kind && (!id||row.id===id));
    if(item)await mediaTransaction('readwrite',store=>store.delete(item.id));
    if(active()?.id===game.id)render();
  } catch {mediaStatus('Zapis mediów jest niedostępny.')}
}

function downloadFile(blob,name) {
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;link.download=name;
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}

const backupLimit=64*1024*1024;
const plain=value=>value && typeof value==='object' && !Array.isArray(value);
const validId=value=>typeof value==='string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
const string=value=>typeof value==='string';
const within=(value,min,max)=>Number.isFinite(value)&&value>=min&&value<=max;

function validateBackup(data) {
  if(data?.format!=='checkpoint-backup'||data.version!==1||!Array.isArray(data.games)||
      !plain(data.preferences)||!plain(data.connections)||!Array.isArray(data.media))throw Error('Format');
  const ids=new Set();
  for(const game of data.games){
    if(!plain(game)||!validId(game.id)||ids.has(game.id)||!string(game.title)||!string(game.catalog)||
       !systems.includes(game.system)||!statuses.includes(game.status)||!plain(game.runs)||!Object.hasOwn(game.runs,game.system)||
       !Array.isArray(game.scores)||!Array.isArray(game.maps)||!Array.isArray(game.tasks)||
       !game.scores.every(value=>value===null||within(value,1,10))||
       (game.guides!==undefined&&(!Array.isArray(game.guides)||
         !game.guides.every(item=>string(item?.name)&&web(item.url)&&(item.goal===undefined||string(item.goal)))))||
       !game.maps.every(item=>string(item?.name)&&web(item.url))||!game.tasks.every(item=>string(item?.name)&&typeof item.done==='boolean'))throw Error('Game');
    for(const [platform,run] of Object.entries(game.runs)){
      if(!systems.includes(platform)||!plain(run)||!within(run.progress,0,100)||!string(run.goal)||!Array.isArray(run.sessions)||
         !run.sessions.every(session=>within(session?.minutes,0,1440)&&string(session.date)&&string(session.note)))throw Error('Playthrough');
    }
    ids.add(game.id);
  }
  const attachments=new Set();
  for(const item of data.media){
    if(!validId(item?.id)||attachments.has(item.id)||!ids.has(item.gameId)||!within(item.created,0,8640000000000000)||
       !string(item.content)||!string(item.type)||!((item.kind==='voice'&&item.type.startsWith('audio/'))||
       (item.kind==='screenshot'&&/^image\/(png|jpeg|webp)$/.test(item.type))))throw Error('Media');
    attachments.add(item.id);
  }
  const seenPlatforms=new Set(['xbox','steam','wand','ps','nintendo']);
  for(const [id,value] of Object.entries(data.connections)){
    if(!seenPlatforms.has(id)||!plain(value)||!string(value.profile)||
       (value.server && !(id==='steam' && web(value.server).startsWith('https://'))))throw Error('Connection');
  }
  return data;
}

function backupStatus(label) {
  const status=document.querySelector('#backup-status');
  if(status)status.textContent=t(label);
}

async function exportBackup() {
  if(deviceBusy)return;
  deviceBusy=true;
  backupStatus('Przygotowuję kopię…');
  try {
    const attachments=await allMedia();
    const media=await Promise.all(attachments.map(async item=>({
      id:item.id,gameId:item.gameId,kind:item.kind,created:item.created,type:item.blob.type,
      content:await new Promise((resolve,reject)=>{
        const reader=new FileReader();
        reader.onload=()=>resolve(reader.result.split(',')[1]);
        reader.onerror=()=>reject(reader.error);
        reader.readAsDataURL(item.blob);
      }),
    })));
    const data={format:'checkpoint-backup',version:1,games,preferences,connections,media};
    const blob=new Blob([JSON.stringify(data)],{type:'application/json'});
    if(blob.size>backupLimit)throw Error('Size');
    downloadFile(blob,'checkpoint-'+new Date().toISOString().slice(0,10)+'.json');
    backupStatus('Kopia gotowa.');
  } catch { backupStatus('Nie udało się utworzyć kopii. Limit pliku to 64 MB.') }
  finally {deviceBusy=false}
}

async function importBackup(file) {
  if(!file || deviceBusy || recording)return;
  deviceBusy=true;
  try {
    if(file.size>backupLimit)throw Error('Size');
    const data=validateBackup(JSON.parse(await file.text()));
    const media=data.media.map(item=>{
      const {type,content,...metadata}=item;
      const decoded=Uint8Array.from(atob(content),char=>char.charCodeAt(0));
      return {...metadata,blob:new Blob([decoded],{type})};
    });
    if(!window.confirm(t('Zastąpić lokalne dane danymi z kopii zapasowej?')))return;
    await replaceDeviceData(data.games,data.preferences,data.connections,media);
    location.reload();
  } catch {backupStatus('Nie udało się wczytać kopii. Sprawdź plik JSON Checkpoint.')}
  finally {deviceBusy=false}
}

async function replaceDeviceData(nextGames,nextSettings,nextConnections,media) {
  const previous=[key,settingsKey,connectionKey].map(name=>[name,localStorage.getItem(name)]);
  const values=[nextGames,nextSettings,nextConnections];
  try {
    previous.forEach(([name],index)=>{
      if(values[index]===null)localStorage.removeItem(name);
      else localStorage.setItem(name,JSON.stringify(values[index]));
    });
    if(typeof indexedDB!=='undefined' || media.length)await replaceMedia(media);
  } catch(error) {
    for(const [name,value] of previous){
      if(value===null)localStorage.removeItem(name);else localStorage.setItem(name,value);
    }
    throw error;
  }
  games=nextGames || [];
  preferences=nextSettings || {};
  connections=nextConnections || {};
}
