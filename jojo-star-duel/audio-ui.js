(() => {
  const audio=JojoAudio,q=s=>document.querySelector(s),panel=q('#audio-settings');
  let player=null,loading=null,ready=false,wanted=false,playerVolume=35,appliedVolume=null,pauseIssued=false;
  let playerEpoch=0,connectionAttempted=false,manualRequired=false,playTimer=null,officialState='idle';
  const names={jotaro:'承太郎',dio:'DIO',giorno:'乔鲁诺',kira:'吉良吉影',pucci:'普奇',okuyasu:'虹村亿泰'};
  const labels={intro:'登场',attack:'普攻',hurt:'受伤',superStart:'替身召唤',superRush:'必杀演出',starAscend:'流星升击',starCounter:'绝境反击',timeAmbush:'时隙闪袭',knifeArray:'时锁刃阵',
    rootBloom:'树根升击',lifeBind:'生命束缚',sheerHeart:'枯萎穿心攻击',chainBomb:'连环引爆',heavenDrive:'天堂加速',gravityWell:'重力牵引',spaceErase:'空间削除',palmCrush:'合掌重击',win:'胜利'};
  const skills=new Set(['starAscend','starCounter','timeAmbush','knifeArray','rootBloom','lifeBind','sheerHeart','chainBomb','heavenDrive','gravityWell','spaceErase','palmCrush']);
  const cueLabel=(id,cue)=>cue==='superRush'&&id==='jotaro'?'欧拉连打':cue==='superRush'&&id==='dio'?'无駄连打':labels[cue]||cue;
  const missingLabel=slot=>{const [id,cue]=slot.split('.');return `暂无${cueLabel(id,cue)}原声`;};
  const select=q('#voice-slot');for(const [slot,entry]of Object.entries(JojoAudioData.voices)){const [id,cue]=slot.split('.'),opt=document.createElement('option');opt.value=slot;opt.textContent=`${names[id]||id} · ${cueLabel(id,cue)}${entry.text?' · '+entry.text:''}`;select.append(opt);}
  const message=text=>q('#audio-message').textContent=text;
  function voiceAvailable(s,slot=select.value){const entry=JojoAudioData.voices[slot];return !!s.imports[slot]||!!(entry?.src&&entry.sourceType!=='unavailable');}
  function render(s){q('#sound').textContent=`声音：${s.enabled?'开':'关'}`;q('#sound').setAttribute('aria-pressed',String(s.enabled));for(const name of ['music','sfx','voice']){q(`#volume-${name}`).value=Math.round(s.volumes[name]*100);q(`#level-${name}`).value=Math.round(s.volumes[name]*100)+'%';}
    q('#audio-status').textContent=s.failedAssets.length?`${s.failedAssets.length} 项音频未加载，可刷新重试`:(s.unlocked?'音频已就绪':'开始对战后启用声音');
    const entry=JojoAudioData.voices[select.value],imported=s.imports[select.value],recorded=!!entry?.src&&entry.sourceType==='recording';
    q('#voice-file-label').textContent=imported||(recorded?`当前原声：${entry.sourceLabel||'社区台词剪辑 · 原集未核对'}`:missingLabel(select.value));
    q('#voice-preview').disabled=!voiceAvailable(s);
    const timing=q('#voice-timing');if(timing){
      const [id,cue]=select.value.split('.'),g=typeof CombatGeometry!=='undefined'?CombatGeometry:null;
      const superCue=cue==='superStart'||cue==='superRush',rule=g?.profile(cue),timeline=superCue?g?.superTimelineFor?.(id):null;
      const duration=superCue?timeline?.duration
        :skills.has(cue)&&rule?rule.startup+rule.active+rule.recovery:0;
      const sequence=superCue&&timeline?` · 前摇固定 1 秒 · ${timeline.voice?.rushStart!=null?'配音原速顺接':'召唤原声延续至攻击'}`:'';
      timing.textContent=imported?(duration?`本地台词已替换 · 招式演出 ${duration.toFixed(2)} 秒`:'本地台词已替换')
        :recorded?`${Number.isFinite(entry.duration)?`录音 ${entry.duration.toFixed(2)} 秒`:'已收录原声'}${duration?` · ${superCue?'完整必杀':'招式演出'} ${duration.toFixed(2)} 秒`:''}`:'';
      if(timing.textContent)timing.textContent+=sequence;
      timing.hidden=!timing.textContent;
    }
    const source=q('#voice-source');if(source){const url=!imported&&recorded?entry.sourceUrl:null;source.hidden=!url;source.textContent=url?'查看社区剪辑来源':'';if(url)source.href=url;else{source.href='';source.removeAttribute?.('href');}}
  }
  function mayPlay(s=audio.getStatus()) {
    return s.enabled&&s.source==='official'&&s.state==='fight'&&s.unlocked!==false&&s.musicAllowed!==false&&!s.background
      &&!document.hidden&&document.visibilityState!=='hidden'&&(!document.hasFocus||document.hasFocus());
  }
  function officialStatus(next,text){
    officialState=next;
    const status=q('#official-status');if(status)status.textContent=text;
    const button=q('#official-load');button.disabled=next==='loading';
    button.textContent=next==='loading'?'正在连接官方配乐…':next==='error'?'重试连接官方配乐':next==='playing'?'官方配乐播放中':'播放官方配乐';
  }
  audio.subscribe(s=>{if(!mayPlay(s))pauseOfficial();render(s);});render(audio.getStatus());
  for(const name of ['music','sfx','voice'])q(`#volume-${name}`).addEventListener('input',e=>audio.setVolume(name,Number(e.target.value)/100));
  panel.addEventListener('toggle',()=>{if(panel.open&&typeof state!=='undefined'&&state==='fight')togglePause();});
  q('#audio-open').onclick=()=>{panel.open=!panel.open;if(panel.open)panel.scrollIntoView({block:'nearest',behavior:'smooth'});};
  select.onchange=()=>render(audio.getStatus());
  q('#voice-preview').onclick=()=>{if(voiceAvailable(audio.getStatus()))return audio.audition(select.value);};
  q('#sfx-preview').onclick=()=>audio.audition('sfx');
  async function importFile(input,slot){const file=input.files[0];if(!file)return;message('正在读取音频…');try{const result=await audio.importAudio(slot,file);message(`已替换这句台词 · ${result.duration.toFixed(1)} 秒${result.saved?' · 已保存在此浏览器':' · 当前页面内有效'}`);}catch(e){message(e.message);}input.value='';}
  q('#voice-file').onchange=e=>importFile(e.target,select.value);
  q('#voice-reset').onclick=async()=>{const slot=select.value;await audio.resetImport(slot);render(audio.getStatus());message(JojoAudioData.voices[slot]?.src?'已恢复这句社区台词录音 · 原集未核对':`已移除导入音频；${missingLabel(slot)}，该音轨保持静默`);};
  function clearPlayTimer(){if(playTimer!==null){clearTimeout(playTimer);playTimer=null;}}
  function pauseOfficial(force=false){
    wanted=false;clearPlayTimer();
    if(officialState==='playing')officialStatus('ready','官方配乐已暂停；回到游戏并继续对战后自动恢复。');
    if(!ready||!player||pauseIssued&&!force)return;
    try{player.pauseVideo();pauseIssued=true;}catch{}
  }
  function applyOfficialVolume(){if(!ready||!player||appliedVolume===playerVolume)return;try{player.setVolume(playerVolume);appliedVolume=playerVolume;}catch{}}
  function discardPlayer(){playerEpoch++;clearPlayTimer();ready=false;wanted=false;appliedVolume=null;pauseIssued=false;try{player?.destroy?.();}catch{}player=null;}
  function officialError(){
    wanted=false;manualRequired=true;
    officialStatus('error','官方播放器连接失败，背景音乐保持静默。请重试连接，或打开官方原曲页面。');
  }
  function autoplayBlocked(epoch,policyBlocked=true){
    if(epoch!==playerEpoch||!ready)return;
    if(!mayPlay()){pauseOfficial(true);return;}
    clearPlayTimer();wanted=false;manualRequired=true;
    officialStatus('blocked',policyBlocked?'浏览器尚未允许配乐播放，请点击“播放官方配乐”。':'配乐尚未开始播放，请点击“播放官方配乐”重试。');
  }
  function requestPlay(manual=false){
    if(!ready||!player||!mayPlay()||wanted&&!manual||manualRequired&&!manual)return false;
    const epoch=playerEpoch;manualRequired=false;wanted=true;pauseIssued=false;clearPlayTimer();
    try{player.playVideo();}catch{autoplayBlocked(epoch,false);return false;}
    if(!wanted||manualRequired||epoch!==playerEpoch)return false;
    // Some browser policies do not emit onAutoplayBlocked. One bounded check
    // exposes a real user-gesture retry without resending play every frame.
    let playing=false;try{playing=player.getPlayerState()===1;}catch{}
    if(!playing)playTimer=setTimeout(()=>{playTimer=null;if(epoch!==playerEpoch||!wanted||!mayPlay())return;
      let active=false;try{active=player.getPlayerState()===1;}catch{}if(!active)autoplayBlocked(epoch,false);
    },3500);
    return true;
  }
  function loadOfficial(){
    if(ready&&player)return Promise.resolve(true);
    if(loading)return loading;
    connectionAttempted=true;manualRequired=false;
    officialStatus('loading','正在连接官方发行版配乐…');
    const section=q('#official-player-section');section.classList.remove('hidden');
    // Destroying a failed YT instance can remove its host iframe.
    if(!q('#official-player')){const host=document.createElement('div');host.id='official-player';section.prepend(host);}
    const epoch=++playerEpoch;
    const task=new Promise(resolve=>{
      let settled=false,created=false;
      const finish=value=>{if(settled)return;settled=true;clearTimeout(timeout);resolve(value);};
      const fail=()=>{if(epoch!==playerEpoch)return;finish(false);discardPlayer();officialError();};
      const timeout=setTimeout(fail,14000);
      const create=()=>{if(epoch!==playerEpoch||created)return;created=true;try{
        player=new YT.Player('official-player',{height:'270',width:'480',videoId:JojoAudioData.official.videoId,playerVars:{playsinline:1,origin:location.origin,loop:1,playlist:JojoAudioData.official.videoId},events:{
          onReady(e){if(epoch!==playerEpoch)return;if(e?.target)player=e.target;ready=true;applyOfficialVolume();
            officialStatus('ready','官方配乐已连接；开始或继续对战后自动播放。');finish(true);
            if(mayPlay())requestPlay();else pauseOfficial();},
          onStateChange(e){if(epoch!==playerEpoch)return;const allowed=mayPlay();
            if((e.data===1||e.data===3)&&!allowed){pauseOfficial(true);return;}
            if(e.data===1){clearPlayTimer();wanted=true;pauseIssued=false;manualRequired=false;officialStatus('playing','正在播放官方发行版配乐 · 暂停、静音或离开游戏时同步暂停。');}
            if(e.data===0&&wanted&&allowed){wanted=false;try{player.seekTo(0);}catch{}requestPlay();}
          },onAutoplayBlocked(){autoplayBlocked(epoch);},onError:fail
        }});
      }catch{fail();}};
      if(window.YT?.Player)create();else{
        const previous=window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady=()=>{try{previous?.();}catch{}create();};
        const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.onerror=fail;document.head.append(script);
      }
    });
    loading=task;
    task.then(()=>{if(loading===task)loading=null;});
    return task;
  }
  async function chooseOfficial(){
    // Keep the ready-player path inside the click gesture. Connecting a new
    // iframe is asynchronous; its onReady checks the latest game permission.
    manualRequired=false;
    if(!audio.getStatus().enabled){audio.setEnabled(true);if(ready&&wanted)return true;}
    if(ready&&mayPlay()){requestPlay(true);return true;}
    await audio.unlock();
    const ok=await loadOfficial();
    if(ok){if(mayPlay())requestPlay();else officialStatus('ready','官方配乐已连接；点回游戏并继续对战即可播放。');}
    return ok;
  }
  q('#official-load').onclick=chooseOfficial;
  // The engine calls play only when its complete active-state gate allows
  // music. A single failed connection never causes a per-frame retry storm.
  audio.registerMusicAdapter({
    play(){if(!mayPlay())return;if(ready){requestPlay();return;}if(!connectionAttempted&&!loading)loadOfficial();},
    pause(){pauseOfficial();},
    setVolume(value){if(!Number.isFinite(value))return;playerVolume=Math.round(Math.max(0,Math.min(1,value))*100);applyOfficialVolume();},
    // getStatus calls this method: never call mayPlay/getStatus from here.
    isPlaying(){try{return ready&&wanted&&player.getPlayerState()===1;}catch{return false;}}
  });
})();
