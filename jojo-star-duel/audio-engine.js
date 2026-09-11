/* Battle events are snapshots: this mixer never schedules or changes game state. */
const JojoAudio = (() => {
  const data=typeof JojoAudioData!=='undefined'?JojoAudioData:{sfx:{},voices:{},official:{}};
  const prefKey='jojo.audio.v1',prefs={enabled:true,music:.35,sfx:.75,voice:.85};
  try {const p=JSON.parse(localStorage.getItem(prefKey));if(p&&typeof p==='object'&&!Array.isArray(p)){if(typeof p.enabled==='boolean')prefs.enabled=p.enabled;for(const k of ['music','sfx','voice'])if(typeof p[k]==='number'&&Number.isFinite(p[k]))prefs[k]=Math.max(0,Math.min(1,p[k]));}}catch{}
  let ctx=null,unlocked=false,state='menu',cinematic=false,background=false,generation=0,unlocking=null;
  const source='official';
  let buses={},voice=null,voiceTicket=0,pendingPriority=0,adapter=null;
  let desiredCue=null,requestedCue=null,pendingManaged=null,managedCinematic=false;
  const buffers=new Map(),loads=new Map(),failed=new Set(),effects=new Set(),cooldowns=new Map(),imports=new Map(),subscribers=new Set();
  let dbPromise=null,lastAdapterVolume=-1;
  const importTickets=new Map();
  const skillEffects=Object.freeze({starAscend:'rise',starCounter:'parry',timeAmbush:'blink',knifeArray:'knifeHold',
    rootBloom:'rise',lifeBind:'energy',sheerHeart:'heavy',chainBomb:'energy',heavenDrive:'dash',gravityWell:'energy',spaceErase:'dash',palmCrush:'heavy'});
  const gainTargets=new WeakMap();
  const active=()=>unlocked&&prefs.enabled&&!background&&state==='fight'&&ctx?.state==='running';
  const stamp=()=>typeof performance!=='undefined'?performance.now():Date.now();
  const notify=()=>{for(const fn of subscribers)try{fn(getStatus());}catch{}};
  const persist=()=>{try{localStorage.setItem(prefKey,JSON.stringify(prefs));}catch{}};
  function target(param,value,seconds=.04){if(!param||!ctx||gainTargets.get(param)===value)return;gainTargets.set(param,value);param.cancelScheduledValues?.(ctx.currentTime);param.setTargetAtTime(value,ctx.currentTime,seconds);}
  function levels(){if(!ctx)return;target(buses.master.gain,prefs.enabled?1:0);target(buses.sfx.gain,prefs.sfx);target(buses.voice.gain,prefs.voice);const duck=cinematic?.17:voice?.26:1;target(buses.music.gain,prefs.music*duck,duck<1?.035:.24);const level=prefs.music*duck*(prefs.enabled?1:0);if(level!==lastAdapterVolume){lastAdapterVolume=level;try{adapter?.setVolume(level);}catch{}}}
  function stopNode(entry){if(!entry)return;try{entry.node.onended=null;entry.node.stop();}catch{}try{entry.node.disconnect();entry.gain?.disconnect();entry.pan?.disconnect();}catch{}}
  function stopVoice(){voiceTicket++;pendingPriority=0;pendingManaged=null;stopNode(voice);voice=null;levels();}
  function stopMusic(){try{adapter?.pause();}catch{}}
  function silence(){generation++;for(const e of effects)stopNode(e);effects.clear();stopVoice();requestedCue=null;pendingManaged=null;stopMusic();cooldowns.clear();notify();}
  async function load(src){if(!src)return null;if(buffers.has(src))return buffers.get(src);if(loads.has(src))return loads.get(src);const task=(async()=>{try{const r=await fetch(src);if(!r.ok)throw Error('audio fetch '+r.status);const b=await ctx.decodeAudioData(await r.arrayBuffer());buffers.set(src,b);return b;}catch{failed.add(src);notify();return null;}})();loads.set(src,task);return task;}
  function bufferFor(slot){if(imports.has(slot))return Promise.resolve(imports.get(slot).buffer);const entry=data.voices[slot];return entry?load(entry.src):Promise.resolve(null);}
  function fallback(){const n=Math.floor(ctx.sampleRate*.12),b=ctx.createBuffer(1,n,ctx.sampleRate),v=b.getChannelData(0);let seed=3471;for(let i=0;i<n;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;v[i]=((seed/4294967296)*2-1)*Math.exp(-i/n*7)*.28;}return b;}
  function playBuffer(buffer,bus,volume=1,face=0){const node=ctx.createBufferSource(),gain=ctx.createGain();node.buffer=buffer;gain.gain.value=volume;node.connect(gain);let pan=null;if(face&&ctx.createStereoPanner){pan=ctx.createStereoPanner();pan.pan.value=Math.sign(face)*.1;gain.connect(pan);pan.connect(buses[bus]);}else gain.connect(buses[bus]);return{node,gain,pan};}
  // Official playback is the only BGM path. Player failures never start a local loop.
  function ensureMusic(){if(active())try{adapter?.play();}catch{}}
  function effect(name,d={},volume=1,audition=false){if((!active()&&!audition)||!unlocked||!prefs.enabled||background)return false;const gen=generation,time=stamp();load(data.sfx[name]||data.sfx.punch).then(b=>{if(gen!==generation||(!active()&&!audition)||stamp()-time>300)return;if(effects.size>=16){const oldest=effects.values().next().value;stopNode(oldest);effects.delete(oldest);}const e=playBuffer(b||fallback(),'sfx',volume,d.face);effects.add(e);e.node.onended=()=>{effects.delete(e);e.node.disconnect();e.gain.disconnect();e.pan?.disconnect();};e.node.start();});return true;}
  function speak(id,cue,priority=1,audition=false){if((!active()&&!audition)||!unlocked||!prefs.enabled||background||prefs.voice===0)return false;const key=`${id}.${cue}`;if(!data.voices[key]||(!data.voices[key].src&&!imports.has(key)))return false;const now=stamp(),wait=cue==='attack'?470:cue==='hurt'?850:cue==='superRush'?1200:600;
    if(!audition&&(now-(cooldowns.get(key)??-Infinity)<wait||priority<(voice?.priority||pendingPriority)||priority===(voice?.priority||pendingPriority)&&priority<3))return false;
    cooldowns.set(key,now);stopVoice();pendingPriority=priority;const ticket=++voiceTicket,gen=generation;
    bufferFor(key).then(b=>{if(ticket!==voiceTicket||gen!==generation)return;pendingPriority=0;if(!b||(!active()&&!audition)||stamp()-now>500)return;const e=playBuffer(b,'voice',.88);voice={...e,priority,key};e.node.onended=()=>{if(voice?.node!==e.node)return;voice=null;e.node.disconnect();e.gain.disconnect();levels();notify();};e.node.start();levels();notify();});return true;
  }
  function validCue(value){
    if(!value||typeof value.id!=='string'||!data.voices[`${value.id}.${value.cue}`]||!['superStart','superRush'].includes(value.cue)
      ||!Number.isFinite(value.offset)||value.offset<0
      ||!(typeof value.token==='number'&&Number.isFinite(value.token)||typeof value.token==='string'&&value.token.length>0))return null;
    return{id:value.id,cue:value.cue,offset:value.offset,token:value.token};
  }
  const cueIdentity=cue=>cue?`${typeof cue.token}:${cue.token}/${cue.id}.${cue.cue}`:null;
  function clearManagedCue(stopCurrent=false){
    desiredCue=null;requestedCue=null;
    if(pendingManaged){voiceTicket++;pendingPriority=0;pendingManaged=null;}
    if(stopCurrent&&voice?.managed)stopVoice();
  }
  function cancelCinematicVoice(id,token){
    if(!(typeof token==='number'&&Number.isFinite(token)||typeof token==='string'&&token.length>0))return false;
    const identities=['superStart','superRush'].map(cue=>cueIdentity({id,cue,token}));
    const matches=identity=>identity&&identities.includes(identity);
    let cancelled=false;
    if(matches(cueIdentity(desiredCue))){desiredCue=null;cancelled=true;}
    if(matches(requestedCue)){requestedCue=null;cancelled=true;}
    if(matches(pendingManaged)){voiceTicket++;pendingPriority=0;pendingManaged=null;cancelled=true;}
    if(matches(voice?.managed)){stopVoice();cancelled=true;}
    if(cancelled){levels();notify();}
    return cancelled;
  }
  // Only a live cinematic may resume. The latest simulation offset is read
  // again after decoding; WebAudio time never advances or rewinds the fight.
  function ensureCueVoice(){
    if(!active()||prefs.voice===0||!desiredCue)return false;
    const identity=cueIdentity(desiredCue),key=`${desiredCue.id}.${desiredCue.cue}`;
    if(requestedCue===identity||voice?.managed===identity)return false;
    const priority=desiredCue.cue==='superRush'?5:4;
    if(priority<(voice?.priority||pendingPriority)||!data.voices[key]||(!data.voices[key].src&&!imports.has(key)))return false;
    stopVoice();requestedCue=identity;pendingManaged=identity;pendingPriority=priority;
    const ticket=++voiceTicket,gen=generation;
    bufferFor(key).then(buffer=>{
      if(ticket!==voiceTicket||gen!==generation||cueIdentity(desiredCue)!==identity)return;
      pendingManaged=null;pendingPriority=0;
      const offset=desiredCue.offset;
      if(!buffer||!active()||prefs.voice===0||!Number.isFinite(offset)||offset<0||!Number.isFinite(buffer.duration)||offset>=buffer.duration)return;
      const e=playBuffer(buffer,'voice',.88);voice={...e,priority,key,managed:identity,offset};
      e.node.onended=()=>{if(voice?.node!==e.node)return;voice=null;e.node.disconnect();e.gain.disconnect();levels();notify();};
      e.node.start(0,offset);levels();notify();
    });return true;
  }
  function cinematicVoice(id,cue,priority){
    // An attack-phase event may arrive while the longer summons is still
    // speaking, or during the authored gap. Only sync's absolute cue may
    // advance this lane; a null gap must not fall back to an immediate shout.
    if(managedCinematic)return desiredCue?.id===id&&desiredCue.cue===cue?ensureCueVoice():false;
    return speak(id,cue,priority);
  }
  function event(type,d={}){if(!active())return false;const id=typeof d.id==='string'?d.id:'jotaro',kind=d.kind||'melee';
    switch(type){
      case 'action': {
        const profile=typeof CombatGeometry!=='undefined'?CombatGeometry.profile(kind):null;
        const ownCue=Object.hasOwn(data.voices,`${id}.${kind}`);
        if(Object.hasOwn(skillEffects,kind)){speak(id,kind,3);effect(skillEffects[kind],d,.68);}
        else if(kind==='melee'||kind==='heavy'||kind==='upper'||profile?.style&&profile.melee){
          effect('swing',d,.68);if(!d.combo||d.combo%2)speak(id,ownCue?kind:'attack',1);
        } else if(ownCue)speak(id,kind,3);
        break;
      }
      case 'impact':effect(d.final?'superFinish':kind==='super'?'superHit':d.power>=2||kind==='heavy'||kind==='finisher'?'heavy':'punch',d,kind==='super'&&!d.final?.48:.85);break;
      case 'block':effect('guard',d,.58);break;
      case 'hurt':if(kind!=='super')speak(id,'hurt',1);break;
      case 'jump':effect('jump',d,.42);break;
      case 'land':effect('land',d,.42);break;
      case 'knockdown':effect('heavy',d,.7);break;
      case 'dash':effect('dash',d,.55);break;
      case 'blinkOut':effect('blink',d,.65);break;
      case 'blinkIn':break;
      case 'cast':if(kind==='super'||Object.hasOwn(skillEffects,kind))break;effect(kind.startsWith('knife')?'knife':'energy',d,.58);break;
      case 'assist':effect('energy',d,.75);break;
      case 'burst':effect('energy',d,.70);effect('superFinish',d,.65);break;
      case 'parry':effect('parry',d,.8);break;
      case 'superStart':effect('superStart',d,.75);cinematicVoice(id,'superStart',4);break;
      case 'superRush':cinematicVoice(id,'superRush',5);break;
      case 'superCancel':cancelCinematicVoice(id,d.token);break;
      case 'ko':clearManagedCue();effect('ko',d,.75);break;
      case 'round':managedCinematic=false;clearManagedCue(true);stopVoice();effect('round',d,.6);speak(d.ids?.[0]||d.id||d.playerId||'jotaro','intro',3);break;
      case 'win':speak(id,'win',5);break;
    }return true;
  }
  function sync(next={}){
    const was=active();if(typeof next.state==='string')state=next.state;if(typeof next.cinematic==='boolean')cinematic=next.cinematic;
    if(state!=='fight'&&state!=='pause'||!cinematic){managedCinematic=false;clearManagedCue(state==='menu'||state==='end');}
    else if(Object.prototype.hasOwnProperty.call(next,'voiceCue')){
      managedCinematic=true;
      const cue=validCue(next.voiceCue);
      if(!cue)clearManagedCue();else desiredCue=cue;
    }
    if(was&&!active())silence();levels();if(active()){ensureMusic();ensureCueVoice();}
  }
  async function unlock(){if(!ctx){try{const C=globalThis.AudioContext||globalThis.webkitAudioContext;if(!C)return false;ctx=new C();buses.master=ctx.createGain();const compressor=ctx.createDynamicsCompressor();compressor.threshold.value=-10;compressor.knee.value=16;compressor.ratio.value=4;compressor.attack.value=.004;compressor.release.value=.12;buses.master.connect(compressor);compressor.connect(ctx.destination);for(const name of ['music','sfx','voice']){buses[name]=ctx.createGain();buses[name].connect(buses.master);}levels();}catch{return false;}}
    // resume is called synchronously from the user's click, before asset I/O.
    let resumed;try{resumed=ctx.resume();}catch{return false;}
    if(!unlocking)unlocking=(async()=>{try{await resumed;unlocked=ctx.state==='running';if(!unlocked)return false;await restoreImports();await Promise.all([...Object.values(data.sfx),...Object.values(data.voices).map(v=>v.src)].map(load));levels();ensureMusic();ensureCueVoice();notify();return true;}catch{return false;}finally{unlocking=null;}})();else try{await resumed;}catch{}
    return unlocking;
  }
  function setEnabled(value){const was=prefs.enabled;prefs.enabled=!!value;persist();if(was&&!prefs.enabled)silence();levels();if(active()){ensureMusic();ensureCueVoice();}notify();}
  function setVolume(channel,value){if(!['music','sfx','voice'].includes(channel)||typeof value!=='number'||!Number.isFinite(value))return;const before=prefs[channel];prefs[channel]=Math.max(0,Math.min(1,value));if(channel==='voice'&&before>0&&prefs.voice===0){stopVoice();pendingManaged=null;requestedCue=null;}persist();levels();if(channel==='voice'&&before===0&&prefs.voice>0)ensureCueVoice();notify();}
  function getStatus(){return{contextState:ctx?.state||'locked',unlocked,enabled:prefs.enabled,state,cinematic,voicePack:'recorded-v1',activeVoice:voice?.key||null,unavailableCues:Object.keys(data.voices).filter(k=>!data.voices[k].src&&!imports.has(k)),activeSfx:effects.size,activeVoices:voice?1:0,musicPlaying:active()&&!!adapter?.isPlaying?.(),musicAllowed:active(),background,ducked:cinematic||!!voice,volumes:{music:prefs.music,sfx:prefs.sfx,voice:prefs.voice},failedAssets:[...failed],source,musicTitle:data.official?.title,imports:Object.fromEntries([...imports].map(([k,v])=>[k,v.name]))};}
  function database(){if(dbPromise)return dbPromise;dbPromise=new Promise(resolve=>{if(typeof indexedDB==='undefined')return resolve(null);try{const r=indexedDB.open('jojo-audio-imports',1);r.onupgradeneeded=()=>r.result.createObjectStore('clips');r.onsuccess=()=>resolve(r.result);r.onerror=()=>resolve(null);}catch{resolve(null);}});return dbPromise;}
  let restored=false;
  async function restoreImports(){if(restored)return;restored=true;const db=await database();if(!db)return;await new Promise(resolve=>{const r=db.transaction('clips').objectStore('clips').getAll();r.onerror=()=>resolve();r.onsuccess=async()=>{for(const row of r.result){try{if(row.slot==='music'||!Object.hasOwn(data.voices,row.slot))continue;const buffer=await ctx.decodeAudioData(row.bytes.slice(0));imports.set(row.slot,{buffer,name:row.name});}catch{}}resolve();};});}
  async function saveImport(slot,bytes,name){const db=await database();if(!db)return false;return new Promise(resolve=>{try{const tx=db.transaction('clips','readwrite');const store=tx.objectStore('clips');if(bytes)store.put({slot,bytes,name},slot);else store.delete(slot);tx.oncomplete=()=>resolve(true);tx.onerror=tx.onabort=()=>resolve(false);}catch{resolve(false);}});}
  async function importAudio(slot,file){if(slot==='music')throw Error('背景音乐固定使用官方发行版');if(!Object.hasOwn(data.voices,slot))throw Error('未知音轨');const ticket=(importTickets.get(slot)||0)+1;importTickets.set(slot,ticket);if(!file||typeof file.arrayBuffer!=='function')throw Error('请选择音频文件');if(file.size>80*1024*1024)throw Error('请选择小于 80 MB 的音频');if(!ctx){const ok=await unlock();if(!ok)throw Error('浏览器未能启用音频');}let buffer,bytes;try{bytes=await file.arrayBuffer();buffer=await ctx.decodeAudioData(bytes.slice(0));}catch{throw Error('无法读取这份音频，请使用 MP3、WAV 或 OGG');}if(!buffer||!Number.isFinite(buffer.duration)||buffer.duration<.03)throw Error('音频内容为空');if(importTickets.get(slot)!==ticket)throw Error('本次导入已取消');imports.set(slot,{buffer,name:file.name||'本地音轨'});const saved=await saveImport(slot,bytes,file.name||'本地音轨');if(importTickets.get(slot)!==ticket)throw Error('本次导入已取消');notify();return{saved,duration:buffer.duration};}
  async function resetImport(slot){if(slot==='music')throw Error('背景音乐固定使用官方发行版');if(!Object.hasOwn(data.voices,slot))throw Error('未知音轨');importTickets.set(slot,(importTickets.get(slot)||0)+1);imports.delete(slot);await saveImport(slot,null);notify();}
  function setMusicSource(value){if(value!=='official')return;levels();ensureMusic();}
  function onBackground(){background=true;silence();}function onForeground(){background=false;levels();if(active()){ensureMusic();ensureCueVoice();}}
  globalThis.addEventListener?.('blur',onBackground);globalThis.addEventListener?.('focus',onForeground);globalThis.document?.addEventListener?.('visibilitychange',()=>globalThis.document.hidden?onBackground():onForeground());
  return{get enabled(){return prefs.enabled;},unlock,setEnabled,setVolume,setVolumes(values){for(const [k,v]of Object.entries(values||{}))setVolume(k,v);},sync,event,getStatus,importAudio,resetImport,setMusicSource,registerMusicAdapter(value){adapter=value;lastAdapterVolume=-1;levels();ensureMusic();},subscribe(fn){subscribers.add(fn);return()=>subscribers.delete(fn);},async audition(slot){await unlock();if(!prefs.enabled)setEnabled(true);if(slot==='sfx')effect('punch',{},.85,true);else{const [id,cue]=slot.split('.');speak(id,cue,6,true);}}};
})();
