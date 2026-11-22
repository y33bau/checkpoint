const googleSyncKey='checkpoint-google-sync-v1';
const googleSyncMaxBytes=900*1024;
let googleServices, googleInit, googleUser, googleSyncState, googleConflict, googleTimer;
let googleBusy=false;
let googleDirty=false;
let googleMessage='';

try{googleSyncState=JSON.parse(localStorage.getItem(googleSyncKey)||'null')}
catch{googleSyncState=null}

function googleEnabled() {
  return Boolean(googleUser && googleSyncState?.uid===googleUser.uid);
}

function googlePanel() {
  const account=googleUser?.email||googleUser?.displayName;
  const enabled=googleEnabled();
  const disabled=googleBusy||!googleServices;
  const button=(label,action,style='')=>'<button type="button" data-act="'+action+'" class="'+style+'"'+
    (disabled?' disabled':'')+'>'+t(label)+'</button>';
  return '<article class="panel settings-card" id="google-sync-panel"><h2>'+t('Synchronizacja Google')+'</h2>'+
    '<p class="muted">'+t('Zapisuj gry, sesje, oceny i cele na swoim koncie. Nagrania i własne okładki przeniesiesz kopią zapasową.')+'</p>'+
    (!checkpointFirebaseConfig?'<p class="muted">'+t('Synchronizacja będzie dostępna po konfiguracji usługi.')+'</p>':
      (account?'<p class="google-account">'+esc(account)+'</p>':'')+
      '<div class="actions">'+(!googleUser?button('Zaloguj przez Google','google-login','primary'):
        (!enabled?button('Włącz synchronizację','google-enable','primary'):
          googleConflict?button('Zachowaj wersję z tego urządzenia','google-use-local')+
            button('Zachowaj wersję z chmury','google-use-cloud'):
            button('Synchronizuj teraz','google-run'))+
        button('Wyloguj','google-logout'))+'</div>'+
      '<p id="google-sync-status" class="muted" role="status">'+t(googleMessage||(!googleServices?'Ładowanie logowania…':''))+'</p>')+
    '</article>';
}

function paintGooglePanel() {
  const panel=document.querySelector('#google-sync-panel');
  if(!panel)return;
  const action=panel.contains(document.activeElement)?document.activeElement.dataset.act:'';
  panel.outerHTML=googlePanel();
  if(action)document.querySelector('#google-sync-panel [data-act="'+action+'"]')?.focus({preventScroll:true});
}

function setGoogleSyncState(state) {
  if(state)localStorage.setItem(googleSyncKey,JSON.stringify(state));
  else localStorage.removeItem(googleSyncKey);
  googleSyncState=state;
}

function pauseGoogleSync() {
  clearTimeout(googleTimer);
  googleConflict=null;
  googleDirty=false;
  setGoogleSyncState(null);
}

function initializeGoogleSync() {
  if(!checkpointFirebaseConfig || googleInit)return;
  const sdk='https://www.gstatic.com/firebasejs/13.4.0/';
  googleInit=Promise.all([
    import(sdk+'firebase-app.js'),import(sdk+'firebase-auth.js'),import(sdk+'firebase-firestore.js'),
  ]).then(([appSdk,auth,fs])=>{
    const app=appSdk.initializeApp(checkpointFirebaseConfig);
    const session=auth.getAuth(app);
    const database=fs.getFirestore(app);
    auth.onAuthStateChanged(session,user=>{
      if(googleUser?.uid!==user?.uid){
        googleConflict=null;
        googleMessage='';
      }
      googleUser=user;
      googleServices={auth,fs,session,database};
      paintGooglePanel();
      if(googleEnabled())scheduleGoogleSync(150);
    });
  }).catch(()=>{
    googleInit=null;
    googleMessage='Nie udało się załadować logowania Google.';
    paintGooglePanel();
  });
}

function scheduleGoogleSync(delay=1800) {
  if(!googleEnabled()||googleConflict)return;
  googleDirty=true;
  clearTimeout(googleTimer);
  googleTimer=setTimeout(()=>runGoogleSync(),delay);
}

function cloudLibrary(source=games) {
  return JSON.stringify(source.map(({customCover,...game})=>game));
}

async function cloudDigest(payload) {
  const bytes=new TextEncoder().encode(payload);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

function readCloudLibrary(payload) {
  return validateBackup({
    format:'checkpoint-backup',version:1,games:JSON.parse(payload),preferences:{},connections:{},media:[],
  }).games;
}

function cloudDecision(base,revision,localHash,remoteHash,hasGames) {
  if(localHash===remoteHash)return 'same';
  if(!revision)return 'upload';
  if(base.hash===localHash || !base.revision&&!hasGames)return 'download';
  if(base.revision===revision)return 'upload';
  return 'conflict';
}

function mergeCloudLibraries(preferred,other) {
  const seen=new Set(preferred.map(game=>game.id));
  return [...preferred,...other.filter(game=>!seen.has(game.id))];
}

function commitCloudLibrary(rows) {
  const localCovers=new Map(games.filter(game=>game.customCover).map(game=>[game.id,game.customCover]));
  const next=rows.map(game=>{
    const cover=localCovers.get(game.id);
    return cover?{...game,customCover:cover}:game;
  });
  localStorage.setItem(key,JSON.stringify(next));
  games=next;
  render();
}

async function runGoogleSync(choice='') {
  if(!googleEnabled()||googleBusy||deviceBusy||recording||dialog.open||document.querySelector('#first-run').open)return;
  if(googleConflict&&!choice)return;
  const base=googleSyncState;
  const {fs,database}=googleServices;
  const doc=fs.doc(database,'checkpointLibraries',base.uid);
  googleBusy=true;
  googleDirty=false;
  googleMessage='Synchronizuję bibliotekę…';
  paintGooglePanel();
  try{
    const local=cloudLibrary();
    const localHash=await cloudDigest(local);
    const remoteDocument=await fs.getDocFromServer(doc);
    if(!googleEnabled()||googleSyncState!==base||deviceBusy||recording||dialog.open)return;
    const remote=remoteDocument.data();
    const revision=remote?.revision||0;
    const remoteRows=remote?readCloudLibrary(remote.payload):[];
    const remoteHash=await cloudDigest(remote?.payload||'[]');
    const decision=cloudDecision(base,revision,localHash,remoteHash,games.length>0);

    if((choice && googleConflict?.revision!==revision) || (!choice && decision==='conflict')){
      googleConflict={revision};
      googleMessage='Biblioteka zmieniła się na dwóch urządzeniach. Wybierz, którą wersję wspólnych gier zachować.';
      return;
    }

    const localRows=JSON.parse(local);
    const write=Boolean(choice)||decision==='upload';
    const rows=choice==='local'?mergeCloudLibraries(localRows,remoteRows):
      choice==='cloud'?mergeCloudLibraries(remoteRows,localRows):decision==='download'?remoteRows:localRows;
    const payload=write?cloudLibrary(rows):decision==='download'?remote.payload:local;
    const hash=await cloudDigest(payload);
    if(!googleEnabled()||googleSyncState!==base||deviceBusy||recording||dialog.open)return;
    if(cloudLibrary()!==local){googleDirty=true;return}

    if(write){
      if(new TextEncoder().encode(payload).byteLength>googleSyncMaxBytes){
        googleMessage='Biblioteka jest za duża do synchronizacji Google. Możesz ją przenieść kopią zapasową.';
        return;
      }
      readCloudLibrary(payload);
      await fs.runTransaction(database,async transaction=>{
        const current=await transaction.get(doc);
        if((current.data()?.revision||0)!==revision)throw Error('checkpoint-revision-changed');
        transaction.set(doc,{revision:revision+1,payload});
      });
    }
    if(!googleEnabled()||googleSyncState!==base||deviceBusy||recording||dialog.open)return;
    if(cloudLibrary()!==local){
      googleDirty=true;
      if(!choice && write)setGoogleSyncState({uid:base.uid,revision:revision+1,hash});
      return;
    }
    if(choice||decision==='download')commitCloudLibrary(rows);
    setGoogleSyncState({uid:base.uid,revision:write?revision+1:revision,hash});
    googleConflict=null;
    googleMessage='Biblioteka zsynchronizowana.';
  }catch(error){
    googleMessage='Synchronizacja chwilowo niedostępna. Dane pozostają na urządzeniu.';
    if(error.message==='checkpoint-revision-changed'){
      googleConflict=null;
      googleDirty=true;
    }
  }finally{
    googleBusy=false;
    paintGooglePanel();
    if(googleDirty)scheduleGoogleSync(600);
  }
}

async function googleAction(action) {
  if(!googleServices||googleBusy)return;
  const {auth,session}=googleServices;
  if(action==='google-login'||action==='google-logout'){
    googleBusy=true;
    try{
      if(action==='google-login'){
        await auth.signInWithPopup(session,new auth.GoogleAuthProvider());
      }else{
        await auth.signOut(session);
        pauseGoogleSync();
        googleMessage='';
      }
    }catch{
      googleMessage=action==='google-login'?'Nie udało się zalogować przez Google.':'Nie udało się wylogować.';
    }finally{
      googleBusy=false;
      paintGooglePanel();
    }
    return;
  }
  if(action==='google-enable'&&googleUser){
    setGoogleSyncState({uid:googleUser.uid,revision:0,hash:''});
    runGoogleSync();
  }
  if(action==='google-run')runGoogleSync();
  if(action==='google-use-local')runGoogleSync('local');
  if(action==='google-use-cloud')runGoogleSync('cloud');
}

window.addEventListener('online',()=>scheduleGoogleSync(100));
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible')scheduleGoogleSync(100);
});
setInterval(()=>{
  if(document.visibilityState==='visible'&&googleEnabled()&&!googleConflict)runGoogleSync();
},60000);
