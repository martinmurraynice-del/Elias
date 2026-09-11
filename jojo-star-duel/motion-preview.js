'use strict';

// Inspect the same combat poses used by the match; the preview never advances
// real fighters, applies damage, or spends their resources.
(() => {
  const panel = document.querySelector('#motion-view');
  if (!panel) return;
  const preview = document.querySelector('#motion-canvas'), pctx = preview.getContext('2d');
  const open = document.querySelector('#motion-open'), close = document.querySelector('#motion-close');
  const play = document.querySelector('#motion-play'), speed = document.querySelector('#motion-speed');
  const scrub = document.querySelector('#motion-scrub'), phase = document.querySelector('#motion-phase');
  const characterSelect = document.querySelector('#motion-character');
  const moves = [...document.querySelectorAll('[data-move]')];
  const motions = [...document.querySelectorAll('[data-motion]')];
  const width = preview.width || 1000, height = preview.height || 390, ground = height - 47;
  let active = false, playing = true, selection = 0, motionSelection = null, elapsed = 0, previous = null, savedState, returnFocus, pauseDisabled, generation = 0;
  const actors = ['jotaro', 'dio'].map((id, index) => ({ ...createFighter(id, index ? 720 : 220, 1),
    previewX: index ? 720 : 220, y: ground, height: 220, surfaceY: ground, shadowY: ground, previewClean: true }));
  const commandLabels = Object.freeze({ upper: 'W + J / 替身上挑', heavy: 'S + J / 下段扫击',
    dashRanged: 'A / D + U / 突进远射', rangedUp: 'W + U / 斜上远射', rangedLow: 'S + U / 低位远射',
    starAscend: 'W + I / 流星升击', starCounter: 'S + I / 绝境反击 · 十字突击',
    timeAmbush: 'W + I / 时隙闪袭', knifeArray: 'S + I / 时锁刃阵' });
  const signatureOwner = Object.freeze({ starAscend:'jotaro',starCounter:'jotaro',timeAmbush:'dio',knifeArray:'dio',
    rootBloom:'giorno',lifeBind:'giorno',sheerHeart:'kira',chainBomb:'kira',heavenDrive:'pucci',gravityWell:'pucci',spaceErase:'okuyasu',palmCrush:'okuyasu' });
  const commandSlots=['upper','heavy','ranged','dashRanged','rangedUp','rangedLow'];
  const resolveCommand=(type,id)=>commandSlots.includes(type)?CombatGeometry.commandsFor(id)[type]:type;
  function selectCharacter(id){
    if(!roster[id])return;
    const opponents=[id,id==='dio'?'jotaro':'dio'];
    actors.splice(0,actors.length,...opponents.map((actor,index)=>({...createFighter(actor,index?720:220,1),previewX:index?720:220,y:ground,height:220,surfaceY:ground,shadowY:ground,previewClean:true})));
    if(characterSelect)characterSelect.value=id;
    motions.forEach(button=>{const owner=signatureOwner[button.dataset.motion?.replace('command-','')];button.hidden=!!owner&&!(id==='jotaro'?['jotaro','dio'].includes(owner):owner===id);});
  }
  const motionLabels = Object.freeze({ run: '交替迈步 / 前进', retreat: '保持架势 / 后撤',
    'jump-prepare': '蹬地 / 起跳', 'jump-rise': '收腿 / 上升', 'jump-apex': '腾空 / 顶点',
    'jump-fall': '下落 / 准备接地', land: '屈膝 / 落地缓冲',
    'dash-prepare': '压低重心 / 冲刺预备', 'dash-travel': '前送身体 / 冲刺', 'dash-brake': '制动 / 回收重心',
    guard: '抬臂 / 保持防御', hit: '受击 / 后仰卸力',
    'charge-prepare': '低身 / 蓄力', 'charge-travel': '十字星光 / 向前突击',
    'charge-contact': '十字爆闪 / 命中', 'charge-brake': '制动 / 收拳',
    'ascend-rise': '腾空 / 追打', 'blink-mark': '刻印 / 蓄势', 'blink-hidden': '时隙 / 瞬移',
    'knife-suspend': '飞刀 / 悬停', 'knife-release': '飞刀 / 释放' });
  const span = move => move.startup + move.active + move.recovery;
  const dashDuration = MOVEMENT.dashDuration || .22, dashSpeed = MOVEMENT.dashSpeed || 1000;
  const jumpFlight = 2 * MOVEMENT.jumpSpeed / MOVEMENT.gravity;
  const airPunchStart = MOVEMENT.jumpSpeed / MOVEMENT.gravity + .025;
  function artReady() {
    if (!CharacterArt.ready) return false;
    return typeof JojoActionSprites === 'undefined' || typeof JojoActionSprites.status !== 'function'
      || actors.every(f => {
        const status = JojoActionSprites.status(f.id);
        return !Object.hasOwn(status, 'fullReady') || status.fullReady === true;
      });
  }
  function timeline() {
    const jab = COMBO_MOVES[0], punch = { state: 'attack', move: jab, index: 1, duration: span(jab), label: '直拳 / 收势' };
    const commandType = motionSelection?.startsWith('command-') ? motionSelection.slice(8) : null;
    if (commandLabels[commandType]||signatureOwner[commandType]) {
      const type=resolveCommand(commandType,actors[0].id),rule=CombatGeometry.profile(type);
      const extra=rule.mark?Math.max(.5,rule.mark.delay+rule.mark.count*rule.mark.interval):rule.projectile?1.2:.5;
      return [{state:'command',type,slot:commandSlots.includes(commandType)?commandType:null,duration:span(rule)+extra,label:rule.label||commandLabels[commandType]}];
    }
    if (motionSelection === 'idle') return [{ state: 'idle', duration: 2.4, label: '呼吸 / 待机' }];
    if (motionSelection === 'run') return [
      { state: 'run', duration: .9, label: '交替迈步 / 前进' },
      { state: 'brake', duration: .14, label: '急停 / 接招' }, punch,
      { state: 'idle', duration: .45, label: '收拳 / 回到架势' }
    ];
    if (motionSelection === 'jump') return [
      { state: 'jump', duration: airPunchStart, flightStart: 0, label: '起跳 / 腾空' },
      { ...punch, state: 'airAttack', flightStart: airPunchStart, label: '空中直拳' },
      { state: 'jump', duration: Math.max(.05, jumpFlight - airPunchStart - span(jab)), flightStart: airPunchStart + span(jab), label: '下落 / 准备接地' },
      { state: 'land', duration: .24, label: '屈膝 / 落地缓冲' },
      { state: 'idle', duration: .4, label: '站稳 / 回到架势' }
    ];
    if (motionSelection === 'dash') return [
      { state: 'dash', duration: dashDuration, label: '压身 / 冲刺 / 制动' },
      { state: 'dashRecover', duration: .22, label: '制动 / 回收重心' },
      { state: 'idle', duration: .45, label: '回到架势' }
    ];
    if (motionSelection === 'guard') return [
      { state: 'guard', duration: .9, label: '抬臂 / 保持防御' },
      { state: 'guardRecover', duration: .22, label: '放下防御 / 回稳' },
      { state: 'idle', duration: .4, label: '回到架势' }
    ];
    if (motionSelection === 'hit') return [
      { state: 'hit', duration: .24, label: '受击 / 后仰卸力' },
      { state: 'knockdown-fall', duration: KNOCKDOWN_TIMING.fall, label: '失去平衡 / 倒下' },
      { state: 'knockdown-down', duration: KNOCKDOWN_TIMING.down, label: '倒地停留' },
      { state: 'knockdown-rise', duration: KNOCKDOWN_TIMING.rise, label: '撑起身体 / 起身' },
      { state: 'idle', duration: .5, label: '站稳 / 回到架势' }
    ];
    if (selection) return [{ move: COMBO_MOVES[selection - 1], index: selection, duration: span(COMBO_MOVES[selection - 1]) + .24 }];
    return COMBO_MOVES.map((move, index) => ({ move, index: index + 1,
      duration: index === COMBO_COUNT - 1 ? span(move) + .36 : move.startup + move.active }));
  }
  function duration() { return timeline().reduce((total, item) => total + item.duration, 0); }
  function current() {
    let time = Math.min(elapsed, duration() - .00001);
    for (const item of timeline()) {
      if (time < item.duration) return { ...item, time };
      time -= item.duration;
    }
  }
  function label(value, x, y, size, color) {
    pctx.font = `600 ${size}px "PingFang SC", sans-serif`; pctx.textAlign = 'center'; pctx.fillStyle = color; pctx.fillText(value, x, y);
  }
  function poseActor(f, item) {
    // Each frame is rebuilt from a neutral preview actor. Scrubbing backwards
    // cannot retain a hit stun, guard flag or airborne state from a later pose.
    Object.assign(f, { x: f.previewX, y: ground, vx: 0, vy: 0, face: 1, grounded: true, supportId: 'floor',
      surfaceY: ground, shadowY: ground, jumps: 0, dash: 0, dashDir: 1, guard: false, blockStun: false,
      stun: 0, inv: 0, attack: null, cinematicPose: null, knockdown: null, standT: 0, standDetached: false,
      motionTime: elapsed, runPhase: elapsed * f.speed * .06, motion: createMotion(), previewClean: true,
      dashOrigin: null, previewShot: null, previewShots: [], previewTarget:null, previewEvents:[], rootT:0,bombMark:null });
    const time = item.time, kind = item.state;
    if (kind === 'run') {
      const move = Math.min(1, time / .12); f.vx = f.speed * move;
      f.motion.move = move; f.motion.travel = move;
    } else if (kind === 'brake') {
      const settle = Math.max(0, 1 - time / item.duration);
      f.vx = f.speed * settle * .3; f.motion.move = settle; f.motion.travel = settle;
    } else if (kind === 'dash') {
      f.dash = Math.max(.001, dashDuration - time); f.vx = dashSpeed;
      f.motion.dash = 1; f.motion.travel = 1;
    } else if (kind === 'dashRecover') {
      f.motion.dash = Math.exp(-18 * time); f.motion.travel = Math.exp(-20 * time) * .3;
    } else if (kind === 'guard' || kind === 'guardRecover') {
      f.guard = kind === 'guard'; f.motion.guard = f.guard ? Math.min(1, .3 + time * 8) : Math.exp(-16 * time);
    } else if (kind === 'hit') {
      f.stun = Math.max(.001, .24 - time); f.vx = -150 * Math.exp(-10 * time);
      f.motion.impact = Math.max(0, 1 - time / .20); f.motion.impactDir = -1;
    } else if (kind?.startsWith('knockdown-')) {
      f.knockdown = { phase: kind.slice('knockdown-'.length), t: time, dir: 1, reason: 'preview' };
    } else if (kind === 'land') {
      f.motion.land = Math.max(0, 1 - time / .24); f.motion.air = Math.exp(-22 * time);
    }
    if (motionSelection === 'dash') {
      f.dashOrigin = { x: f.previewX, y: ground };
      f.x += (kind === 'dash' ? Math.min(time, dashDuration) : dashDuration) * dashSpeed;
      f.previewClean = false;
    }
    if (kind === 'jump' || kind === 'airAttack') {
      const flight = Math.min(jumpFlight, item.flightStart + time);
      f.y = ground - MOVEMENT.jumpSpeed * flight + MOVEMENT.gravity * .5 * flight * flight;
      f.vy = -MOVEMENT.jumpSpeed + MOVEMENT.gravity * flight;
      f.grounded = false; f.supportId = null; f.jumps = 1;
      f.motion.air = 1; f.motion.takeoff = Math.max(0, 1 - flight / .16);
    }
    if (item.move && time < span(item.move)) {
      const move = item.move;
      f.attack = { type: 'melee', combo: item.index, motionKey: move.motionKey,
        t: time, startup: move.startup, active: move.active, duration: span(move), contactTimes: move.contactTimes };
    }
    if (kind === 'command') {
      if(item.slot)item={...item,type:resolveCommand(item.slot,f.id)};
      const rule = CombatGeometry.profile(item.type), s = CombatGeometry.scale(f), end = span(rule);
      if (signatureOwner[item.type] && signatureOwner[item.type] !== f.id) return;
      if (signatureOwner[item.type]) f.x -= 65;
      f.previewClean = false;
      if(rule.style&&rule.melee&&rule.chargeStart==null)f.x+=Math.min(time,rule.startup+rule.active)*rule.lunge*s;
      if (rule.dashStart != null) {
        f.x += Math.max(0, Math.min(rule.dashEnd, time) - rule.dashStart) * rule.dashSpeed * s;
        if (time >= rule.dashStart && time < rule.dashEnd) f.vx = rule.dashSpeed * s;
      }
      if (time < end) {
        f.attack = { type: item.type, motionKey: item.type, t: time, startup: rule.startup,
          active: rule.active, duration: end, contactTimes: rule.contactTimes || [rule.startup] };
        f.standT = end - time; f.standAge = time;
      }
      if (rule.speed && time >= rule.startup) {
        const age = time - rule.startup, angle = rule.angle || 0;
        const origin = CombatGeometry.castPoint(f, item.type), vx = Math.cos(angle) * rule.speed, vy = Math.sin(angle) * rule.speed;
        f.previewShot = { owner: { id: f.id }, type: item.type, x: origin.x + vx * age, y: origin.y + vy * age,
          vx, vy, age, t: Math.max(0, rule.distance * s / rule.speed - age), r: rule.radius * s };
      }
      if (item.type === 'starAscend') {
        const flight = Math.max(0, time-rule.launchAt);
        f.x += Math.min(time,rule.startup+rule.active)*rule.lunge*s;
        if (flight > 0 && flight < -2*rule.launchSpeed/MOVEMENT.gravity) {
          f.y=ground+rule.launchSpeed*flight+MOVEMENT.gravity*.5*flight*flight;
          f.vy=rule.launchSpeed+MOVEMENT.gravity*flight;f.grounded=false;f.supportId=null;f.jumps=1;
        }
      }
      if (item.type === 'timeAmbush' && f.attack) {
        f.attack.blinkOrigin={x:f.x,y:f.y};
        f.attack.blinkTarget={x:f.x+rule.blinkDistance*s,y:f.y};
        if(time>=rule.blinkAt){f.x=f.attack.blinkTarget.x;f.attack.blinked=true;}
      } else if (item.type === 'timeAmbush') f.x+=rule.blinkDistance*s;
      if (item.type === 'starCounter' || item.type === 'heavenDrive') {
        const origin = { x: f.x, y: f.y }, travelTime = Math.max(0, Math.min(time, rule.chargeEnd) - rule.chargeStart);
        const distance = (travelTime * rule.chargeSpeed + .5*(rule.chargeAcceleration||0)*travelTime*travelTime) * s;
        f.x += distance;
        if (f.attack) {
          f.attack.chargeOrigin = origin; f.attack.chargeStarted = time >= rule.chargeStart;
          f.attack.chargeTravel = distance; f.attack.chargeStopped = time >= rule.chargeEnd;
          if (f.attack.chargeStopped) f.attack.chargeStoppedAt = rule.chargeEnd;
        }
        if (time >= rule.chargeStart && time < rule.chargeEnd) f.vx = (rule.chargeSpeed+(rule.chargeAcceleration||0)*travelTime) * s;
      }
      if(rule.style&&signatureOwner[item.type])previewInteraction(f,item,rule,s);
      if(item.type==='knifeArray'&&time>=rule.startup){
        for(let index=0;index<rule.count;index++){
          const release=rule.releaseStart+index*rule.releaseGap,age=Math.max(0,time-release),held=time<release;
          const type=index===rule.count-1?'knifeFinish':'knife',spec=CombatGeometry.profile(type),angle=rule.angles[index];
          const vx=Math.cos(angle)*spec.speed,vy=Math.sin(angle)*spec.speed;
          f.previewShots.push({owner:{id:f.id},type,held,knifeIndex:index,hoverAge:time-rule.startup,
            x:f.x+(70+index*13)*s+vx*age,y:f.y-(198-index*24)*s+vy*age,vx,vy,age,t:spec.distance*s/spec.speed-age,r:spec.radius*s});
        }
      }
    }
  }
  function previewInteraction(f,item,rule,s) {
    const time=item.time,base=f.previewX-65;
    const distance=rule.projectile?320:item.type==='spaceErase'?340:item.type==='gravityWell'?300:item.type==='heavenDrive'?230:145;
    const id=f.id==='dio'?'jotaro':'dio';
    const target={...createFighter(id,base+distance*s,-1),x:base+distance*s,y:ground,prevY:ground,height:220,
      grounded:true,supportId:'floor',surfaceY:ground,shadowY:ground,previewClean:true,motion:createMotion(),motionTime:elapsed};
    if(item.type==='heavenDrive'){
      const room=(distance-CombatGeometry.rules.bodyGap)*s,travel=Math.min(room,f.x-base);
      f.x=base+travel;
      if(f.attack){f.attack.chargeTravel=Math.max(0,travel);f.attack.chargeStopped=travel>=room;
        if(f.attack.chargeStopped){f.vx=0;f.attack.chargeStoppedAt=rule.chargeStart+(-rule.chargeSpeed+Math.sqrt(rule.chargeSpeed**2+2*rule.chargeAcceleration*room/s))/rule.chargeAcceleration;}}
    }
    const contactAt=rule.projectile?rule.startup+Math.max(0,(target.x-26*s-(base+85*s))/rule.speed):rule.startup;
    const since=time-contactAt;
    if(rule.grounded&&f.previewShot){f.previewShot.y=ground-f.previewShot.r;f.previewShot.vy=0;f.previewShot.homing=true;f.previewShot.grounded=true;}
    if(rule.projectile&&since>=0)f.previewShot=null;
    if(since>=0){
      target.stun=Math.max(0,rule.stun-since);target.motion.impact=Math.max(0,1-since/.20);target.motion.impactDir=1;
      target.rootT=Math.max(0,(rule.root||0)-since);
      if(rule.pull)target.x-=Math.min((distance-CombatGeometry.rules.bodyGap)*s,rule.pull*s*.1*(1-Math.exp(-10*since)));
      if(rule.erase)target.x-=Math.min((distance-CombatGeometry.rules.bodyGap)*s,rule.erase*s);
      if(rule.mark){const m=rule.mark,first=contactAt+m.delay,triggered=time<first?0:Math.min(m.count,1+Math.floor((time-first+1e-9)/m.interval));
        if(triggered<m.count)target.bombMark={ownerId:f.id,ownerIndex:0,count:m.count,index:triggered,remaining:first+triggered*m.interval-time};
        for(let i=0;i<m.count;i++){const age=time-first-i*m.interval;if(age>=0&&age<.35)f.previewEvents.push({type:'detonate',kind:i===m.count-1?'bombDetonateFinish':'bombDetonate',ownerId:f.id,x:target.x,y:ground-135*s,dir:1,scale:s,size:28,age,duration:.35,power:2});}
        if(triggered===m.count&&m.count>1)previewDown(target,time-(first+(m.count-1)*m.interval));
      } else if(rule.knockdown)previewDown(target,since);
      if(item.type==='rootBloom'){
        let y=ground,velocity=0,previousTime=0;
        for(let i=0;i<rule.contactTimes.length;i++){
          const at=rule.contactTimes[i];if(time<at)break;
          const dt=at-previousTime;y=Math.min(ground,y+velocity*dt+MOVEMENT.gravity*.5*dt*dt);
          velocity=i===rule.contactTimes.length-1?CombatGeometry.profile(rule.lastKind).lift:rule.lift;y-=2;previousTime=at;
        }
        const dt=time-previousTime;target.y=Math.min(ground,y+velocity*dt+MOVEMENT.gravity*.5*dt*dt);target.vy=velocity+MOVEMENT.gravity*dt;
        target.grounded=target.y>=ground;target.supportId=target.grounded?'floor':null;target.motion.air=target.grounded?0:1;
        if(time>=rule.contactTimes.at(-1))target.knockdown={phase:target.grounded?'down':'fall',t:Math.max(0,time-rule.contactTimes.at(-1)),dir:1,reason:'preview'};
      }
    }
    f.previewTarget=target;
  }
  function previewDown(target,time) {
    const t=KNOCKDOWN_TIMING;
    if(time<t.fall)target.knockdown={phase:'fall',t:time,dir:1,reason:'preview'};
    else if(time<t.fall+t.down)target.knockdown={phase:'down',t:time-t.fall,dir:1,reason:'preview'};
    else if(time<t.fall+t.down+t.rise)target.knockdown={phase:'rise',t:time-t.fall-t.down,dir:1,reason:'preview'};
  }

  function paint() {
    const item = current(), signature = signatureOwner[item.type];
    pctx.clearRect(0, 0, width, height);
    pctx.fillStyle = '#18151f'; pctx.fillRect(0, 0, width, height);
    pctx.strokeStyle = '#c4b4d31b'; pctx.lineWidth = 1;
    pctx.beginPath(); if(!signature){pctx.moveTo(width / 2, 30); pctx.lineTo(width / 2, ground + 17);} pctx.moveTo(45, ground + 1); pctx.lineTo(width - 45, ground + 1); pctx.stroke();
    for (let index = 0; index < actors.length; index++) {
      const f = actors[index]; poseActor(f, item);
      if(signature && f.id!==signature)continue;
      pctx.save();
      if (item.state === 'command') {
        pctx.beginPath(); pctx.rect(signature ? 1 : index * width / 2 + 1, 43, signature ? width-2 : width / 2 - 2, ground - 37); pctx.clip();
        if (signature) {
          const rule = CombatGeometry.profile(item.type), size = CombatGeometry.scale(f);
          const travel = (rule.blinkDistance || rule.chargeDistance || (rule.chargeSpeed?rule.chargeSpeed*(rule.chargeEnd-rule.chargeStart)+.5*(rule.chargeAcceleration||0)*(rule.chargeEnd-rule.chargeStart)**2:0)) * size;
          let zoom = Math.min(.92, (width - 200) / (travel + f.height * 1.6));
          if (item.type === 'starAscend') {
            const rise = rule.launchSpeed ** 2 / (2 * MOVEMENT.gravity);
            const top = CombatGeometry.strike({ ...f, x: 0, y: 0 }, { type: item.type }, 2);
            zoom = Math.min(zoom, (ground - 52) / (Math.max(f.height, -top.y) + rise + 48 * size));
          }
          if(rule.style){const high=rule.points?Math.max(...rule.points.map(point=>-point[1]))*size:f.height;zoom=Math.min(zoom,(ground-58)/(high+52*size),(width-180)/(Math.max(travel,380*size)+f.height));}
          pctx.translate(width * .18, ground); pctx.scale(zoom, zoom); pctx.translate(-f.previewX + 65, -ground);
        }
      }
      if (motionSelection === 'dash') {
        const pane = width / 2, zoom = Math.min(1, (pane - 90) / (dashDuration * dashSpeed + f.height * .95));
        pctx.beginPath(); pctx.rect(index * pane + 1, 43, pane - 2, ground - 37); pctx.clip();
        pctx.translate(index * pane + 95, ground); pctx.scale(zoom, zoom); pctx.translate(-f.previewX, -ground);
      }
      if (motionSelection === 'jump') {
        // Fit the taller real jump and full silhouettes below the name labels.
        // One uniform scale covers this entire demonstration, including landing.
        const rise = MOVEMENT.jumpSpeed ** 2 / (2 * MOVEMENT.gravity);
        const zoom = Math.min(1, (ground - 42) / (f.height + rise));
        pctx.translate(f.x, ground); pctx.scale(zoom, zoom); pctx.translate(-f.x, -ground);
      }
      drawCombatant(pctx, f, elapsed);
      if(f.previewTarget){drawCombatant(pctx,f.previewTarget,elapsed);if(typeof BattleVFX!=='undefined')BattleVFX.drawStatus?.(pctx,f.previewTarget);}
      if(typeof BattleVFX!=='undefined')f.previewEvents.forEach(event=>BattleVFX.drawEvent(pctx,event));
      if (f.previewShot?.t > 0 && typeof BattleVFX !== 'undefined') {
        BattleVFX.drawProjectile(pctx, f.previewShot, elapsed);
      }
      if(typeof BattleVFX!=='undefined'){
        f.previewShots.filter(p=>p.t>0).forEach(p=>BattleVFX.drawProjectile(pctx,p,elapsed));
      }
      pctx.restore();
      label(f.name, signature ? width/2 : index ? 750 : 250, 29, 16, f.color);
      label(item.move ? (f.id==='jotaro'||f.id==='dio'?item.move.labels[f.id==='dio'?1:0]:['试探直拳','反手追击','踏步侧踢',f.stand+'·双击',f.stand+'·终结拳'][item.index-1]) : item.label,
        signature ? width/2 : index ? 750 : 250, height - 12, 14, '#c1b5cb');
    }
    const lead=signatureOwner[item.type] ? actors.find(f=>f.id===signatureOwner[item.type]) : actors[0];
    const beat = typeof JojoActionSprites !== 'undefined' && JojoActionSprites.ready(lead.id)
      ? JojoActionSprites.sample(lead) : JojoRig.attackBeat(lead.attack);
    phase.value = motionSelection && !lead.attack ? (['brake', 'guardRecover'].includes(item.state) ? item.label : motionLabels[beat.phase] || item.label)
      : motionLabels[beat.phase] || (!lead.attack || beat.phase === 'ready' ? '回到架势'
      : beat.phase === 'prepare' ? '蓄势 / 起手' : ['strike', 'contact'].includes(beat.phase) ? '伸展 / 命中'
      : beat.phase === 'rebound' ? '换手 / 追击' : '回收 / 收势');
    scrub.value = Math.round(elapsed / duration() * 1000);
    play.textContent = playing ? '暂停动画' : '播放动画';
  }
  function frame(ms, run) {
    if (!active || run !== generation) return;
    if (playing && previous !== null) elapsed = (elapsed + Math.min((ms - previous) / 1000, .08) * Number(speed.value)) % duration();
    previous = ms; paint(); requestAnimationFrame(next => frame(next, run));
  }
  open.onclick = () => {
    if (!artReady() || active) return;
    savedState = state; returnFocus = document.activeElement; state = 'pause'; clearInput();
    pauseDisabled = document.querySelector('#pause').disabled; document.querySelector('#pause').disabled = true;
    active = true; playing = true; elapsed = 0; previous = null;
    const run = ++generation;
    panel.classList.remove('hidden'); close.focus(); requestAnimationFrame(ms => frame(ms, run));
  };
  function dismiss() {
    if (!active) return;
    active = false; generation++; panel.classList.add('hidden'); state = savedState; clearInput(); last = null; acc = 0;
    document.querySelector('#pause').disabled = pauseDisabled;
    if (returnFocus && typeof returnFocus.focus === 'function') returnFocus.focus();
  }
  close.onclick = dismiss;
  play.onclick = () => { playing = !playing; previous = null; paint(); };
  scrub.oninput = () => { playing = false; elapsed = Number(scrub.value) / 1000 * duration(); paint(); };
  moves.forEach(button => button.onclick = () => {
    selection = Number(button.dataset.move); motionSelection = null;
    moves.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    motions.forEach(item => item.setAttribute('aria-pressed', 'false'));
    // Selecting a single move shows its contact pose immediately; play reveals
    // the full wind-up and recovery, and the slider can inspect any in-between.
    elapsed = selection ? COMBO_MOVES[selection - 1].contactTimes[0] : 0;
    playing = !selection; previous = null; paint();
  });
  motions.forEach(button => button.onclick = () => {
    const owner=signatureOwner[button.dataset.motion?.replace('command-','')];
    if(owner&&!actors.some(f=>f.id===owner))selectCharacter(owner);
    motionSelection = button.dataset.motion; selection = 0;
    motions.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    moves.forEach(item => item.setAttribute('aria-pressed', 'false'));
    elapsed = 0; playing = true; previous = null; paint();
  });
  if(characterSelect)characterSelect.onchange=()=>{
    selectCharacter(characterSelect.value);motionSelection=null;selection=0;elapsed=0;playing=true;previous=null;
    motions.forEach(button=>button.setAttribute('aria-pressed','false'));
    moves.forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.move)===0)));
    if(active)paint();
  };
  selectCharacter('jotaro');
  window.addEventListener('keydown', event => {
    if (!active) return;
    if (event.code === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); dismiss(); }
    if (event.code === 'Tab') {
      const focusable = [...panel.querySelectorAll('button, select, input')];
      const first = focusable[0], final = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); final.focus(); }
      else if (!event.shiftKey && document.activeElement === final) { event.preventDefault(); first.focus(); }
    }
  }, true);
  function awaitArt() {
    if (artReady()) { open.disabled = false; return; }
    requestAnimationFrame(awaitArt);
  }
  awaitArt();
})();
