'use strict';

// World-space combat geometry measured from the generated contact frames.
// Simulation and effects share these points; camera zoom never changes reach.
const CombatGeometry = (() => {
  const freeze = value => { Object.values(value).forEach(v => { if (v && typeof v === 'object') freeze(v); }); return Object.freeze(value); };
  // Every ultimate has the same live 0.3-second opening. Published recording
  // metadata may shape its performance, never the opponent's reaction window.
  const superStartup = .3;
  const defaultVoiceLengths = Object.freeze({ 'jotaro.superStart': 1.0171428571428571, 'jotaro.superRush': 4.06374149659864,
    'dio.superStart': 1.8546938775510204, 'dio.superRush': 5.015986394557823,
    'jotaro.starAscend': .81, 'jotaro.starCounter': .81, 'dio.timeAmbush': 1.8546938775510204, 'dio.knifeArray': 1.25,
    'giorno.superStart': 2.38, 'giorno.superRush': 3.624013605442177,
    'kira.superStart': 2.6880045351473925, 'kira.superRush': 0,
    'pucci.superStart': 1.7280045351473923, 'pucci.superRush': 1.7520181405895692,
    'okuyasu.superStart': 2.06, 'okuyasu.superRush': 1.932018140589569 });
  const voiceLength = key => {
    const value = typeof JojoVoiceTiming !== 'undefined' ? JojoVoiceTiming.durations?.[key] : undefined;
    return Number.isFinite(value) && value > 0 ? value : defaultVoiceLengths[key];
  };
  function superVoice(id) {
    const startEnd = voiceLength(id + '.superStart'), rushLength = voiceLength(id + '.superRush');
    const rushStart = rushLength > 0 ? Math.max(superStartup, startEnd + .06) : null;
    return { startEnd, rushStart, rushEnd: rushStart === null ? null : rushStart + rushLength };
  }
  function makeSuperTimeline(id) {
    const voice = superVoice(id);
    const phases = { freeze: superStartup - .22, approach: .22,
      rush: voice.rushEnd + .08 - superStartup, finish: .30, recover: .30 };
    const starts = {}; let duration = 0;
    for (const [phase, length] of Object.entries(phases)) { starts[phase] = duration; duration += length; }
    const rushCount = Math.max(1, Math.round(phases.rush / .08)), beat = phases.rush / rushCount, finalOffset = .08;
    return freeze({ id, phases, starts, duration, voice, rushCount, beat,
      firstContact: starts.rush + beat / 2, finalContact: starts.finish + finalOffset, finalOffset });
  }
  function authoredTimeline(id, minimumRush, count, curve, rushDamage, push) {
    const voice=superVoice(id), originalRush=Math.max(minimumRush,(voiceLength(id+'.superRush')||0)+.08);
    const rush=Math.max(originalRush,(voice.rushEnd??voice.startEnd)+.08-superStartup);
    // Rapid barrages keep their cadence while names finish over the early
    // strikes. Six explosions / three heavy swipes retain their authored count.
    if(id==='giorno'||id==='pucci')count=Math.max(count,Math.round(count*rush/originalRush));
    const phases={freeze:superStartup-.22,approach:.22,rush,finish:.34,recover:.32},starts={};let duration=0;
    for(const [name,length]of Object.entries(phases)){starts[name]=duration;duration+=length;}
    const contacts=Array.from({length:count},(_,i)=>starts.rush+rush*Math.pow((i+.5)/count,curve));
    return freeze({id,phases,starts,duration,voice,rushCount:count,beat:rush/count,contacts,firstContact:contacts[0],finalOffset:.10,finalContact:starts.finish+.10,push,
      budget:{rushDamageTotal:rushDamage,finalDamage:300-rushDamage}});
  }
  const superTimelines = freeze({ jotaro: makeSuperTimeline('jotaro'), dio: makeSuperTimeline('dio'),
    giorno:authoredTimeline('giorno',2.08,26,1,210,320),kira:authoredTimeline('kira',1.80,6,1,120,480),
    pucci:authoredTimeline('pucci',2.12,28,.58,240,400),okuyasu:authoredTimeline('okuyasu',1.02,3,1,90,670) });
  const superTimelineFor = id => superTimelines[id] || superTimelines.jotaro;
  const superTimeline = superTimelines.jotaro;
  const ascendVoice = voiceLength('jotaro.starAscend'), counterVoice = voiceLength('jotaro.starCounter');
  const ambushVoice = voiceLength('dio.timeAmbush'), ambushBlink = Math.max(.18, ambushVoice + .12);
  const knifeVoice = voiceLength('dio.knifeArray'), knifeRelease = Math.max(.48, knifeVoice + .12);
  const expandedCommands = freeze({
    giorno:{upper:'rootUpper',heavy:'vineSweep',ranged:'lifeSeed',dashRanged:'seedDash',rangedUp:'seedUp',rangedLow:'vineBind',upSkill:'rootBloom',downSkill:'lifeBind'},
    kira:{upper:'bombUpper',heavy:'bombTouch',ranged:'coinBomb',dashRanged:'bombDash',rangedUp:'bombArc',rangedLow:'groundBomb',upSkill:'sheerHeart',downSkill:'chainBomb'},
    pucci:{upper:'gravityUpper',heavy:'gravityCrush',ranged:'speedNeedle',dashRanged:'speedDash',rangedUp:'gravityShot',rangedLow:'lowNeedle',upSkill:'heavenDrive',downSkill:'gravityWell'},
    okuyasu:{upper:'spaceUpper',heavy:'palmHeavy',ranged:'spaceTear',dashRanged:'eraseDash',rangedUp:'spaceArc',rangedLow:'lowErase',upSkill:'spaceErase',downSkill:'palmCrush'}
  });
  const commandsFor = id => expandedCommands[id] || {upper:'upper',heavy:'heavy',ranged:'ranged',dashRanged:'dashRanged',rangedUp:'rangedUp',rangedLow:'rangedLow',upSkill:id==='dio'?'timeAmbush':'starAscend',downSkill:id==='dio'?'knifeArray':'starCounter'};
  const melee = (label,style,damage,extra={}) => ({label,style,damage,melee:true,push:120,stun:.25,stop:.035,size:20,lunge:105,startup:.16,active:.12,recovery:.24,...extra});
  const shot = (label,style,extra={}) => ({label,style,projectile:true,damage:42,push:120,stun:.20,stop:.025,size:20,speed:570,distance:740,radius:12,cost:16,startup:.18,active:.08,recovery:.23,...extra});
  const expandedRules = {
    rootUpper:melee('生命·树根上挑','plant',50,{lift:-420,points:[[155,-230,24,-50]]}),
    vineSweep:melee('生命·藤蔓低缠','plant',50,{root:.38,points:[[170,-48,25,-50]]}),
    lifeSeed:shot('生命·甲虫种子','plant',{root:.20,speed:490}),
    seedDash:shot('生命·疾走播种','plant',{cost:24,damage:48,root:.25,startup:.27,dashStart:.04,dashEnd:.21,dashSpeed:580}),
    seedUp:shot('生命·飞鸟升种','plant',{angle:-Math.PI/5,lift:-290}),
    vineBind:shot('生命·贴地藤索','plant',{lane:'low',root:.40,speed:430,damage:38}),
    rootBloom:melee('黄金体验·树根升击','plant',26,{cost:50,startup:.18,active:.49,recovery:.32,contactTimes:[.18,.38,.60],damages:[26,26,58],lift:-310,lunge:0,radius:22,points:[[175,-150,28,-28],[195,-216,30,-32],[215,-282,30,-34]],lastKind:'rootBloomFinish'}),
    rootBloomFinish:melee('树根终击','plant',58,{lift:-500,knockdown:true,push:190}),
    lifeBind:shot('黄金体验·生命藤牢','plant',{cost:35,damage:45,root:.72,speed:420,distance:840,radius:17,startup:.25,recovery:.34}),
    bombUpper:melee('杀手皇后·爆破上挑','bomb',56,{lift:-410,points:[[125,-230,22,-66]]}),
    bombTouch:melee('杀手皇后·接触炸弹','bomb',18,{mark:{delay:.70,count:1,damage:60,interval:.22},points:[[143,-160,25,-144]]}),
    coinBomb:shot('杀手皇后·硬币炸弹','bomb',{speed:460,damage:30,mark:{delay:.65,count:1,damage:26,interval:.22}}),
    bombDash:shot('杀手皇后·突进爆弹','bomb',{damage:48,cost:24,startup:.29,dashStart:.05,dashEnd:.22,dashSpeed:580}),
    bombArc:shot('杀手皇后·抛物爆弹','bomb',{angle:-Math.PI/4,speed:430,damage:48,lift:-260}),
    groundBomb:shot('杀手皇后·贴地爆弹','bomb',{lane:'low',speed:370,damage:50}),
    sheerHeart:shot('杀手皇后·枯萎穿心攻击','bomb',{cost:55,damage:88,speed:210,distance:1250,radius:19,startup:.32,recovery:.35,homing:true,grounded:true,knockdown:true,push:320}),
    chainBomb:melee('杀手皇后·连环引爆','bomb',24,{cost:45,startup:.20,active:.12,recovery:.45,lunge:100,mark:{delay:.36,count:3,damage:30,interval:.23},points:[[152,-158,25,-145]]}),
    bombDetonate:melee('接触爆破','bomb',30,{push:80,stun:.19,stop:.026,size:26}),
    bombDetonateFinish:melee('连环爆破终击','bomb',30,{push:290,knockdown:true,size:36}),
    gravityUpper:melee('天堂制造·重力上挑','gravity',50,{lift:-535,push:65,points:[[125,-253,28,-62]]}),
    gravityCrush:melee('天堂制造·重力下压','gravity',76,{lift:280,knockdown:true,points:[[145,-85,28,-168]]}),
    speedNeedle:shot('天堂制造·时速针','speed',{speed:950,damage:36,distance:800,radius:8,startup:.10,recovery:.19}),
    speedDash:shot('天堂制造·加速穿刺','speed',{cost:24,damage:44,speed:1060,startup:.23,dashStart:.025,dashEnd:.18,dashSpeed:880}),
    gravityShot:shot('天堂制造·升空引力','gravity',{angle:-Math.PI/4,lift:-410,speed:680,damage:38}),
    lowNeedle:shot('天堂制造·低空时针','speed',{lane:'low',speed:900,damage:36,radius:8}),
    heavenDrive:melee('天堂制造·加速突袭','speed',24,{cost:55,startup:.17,active:.43,recovery:.25,contactTimes:[.17,.32,.49],damages:[24,24,52],chargeStart:.08,chargeEnd:.58,chargeSpeed:500,chargeAcceleration:1600,push:70,points:[[145,-166,24,-155],[153,-178,24,-153],[170,-159,28,-153]],lastKind:'heavenDriveFinish'}),
    heavenDriveFinish:melee('加速突袭终击','speed',52,{push:300,knockdown:true}),
    gravityWell:melee('天堂制造·重力牵引','gravity',55,{cost:40,startup:.24,active:.16,recovery:.40,lunge:0,pull:1100,pullCapture:true,stun:.38,radius:40,points:[[552,-132,40,-132]]}),
    spaceUpper:melee('轰炸空间·上扫削除','space',60,{lift:-440,startup:.19,points:[[175,-242,30,-60]]}),
    palmHeavy:melee('轰炸空间·合掌重击','space',94,{startup:.25,recovery:.33,push:390,knockdown:true,points:[[165,-148,25,-148]]}),
    spaceTear:shot('轰炸空间·空间裂口','space',{damage:48,speed:400,distance:500,radius:19,pull:280,cost:18}),
    eraseDash:shot('轰炸空间·踏步削除','space',{damage:56,cost:26,speed:460,distance:530,startup:.30,dashStart:.06,dashEnd:.23,dashSpeed:600}),
    spaceArc:shot('轰炸空间·上空裂口','space',{damage:46,angle:-Math.PI/5,lift:-350,speed:450,distance:550,radius:17}),
    lowErase:shot('轰炸空间·地面削除','space',{lane:'low',damage:44,speed:360,distance:540,pull:250,radius:18}),
    spaceErase:melee('轰炸空间·空间削除','space',38,{cost:35,startup:.23,active:.11,recovery:.34,lunge:0,erase:448,pullCapture:true,stun:.40,radius:29,points:[[672,-135,30,-135]]}),
    palmCrush:melee('轰炸空间·两掌合击','space',132,{cost:55,startup:.38,active:.13,recovery:.40,lunge:130,push:650,knockdown:true,radius:21,points:[[190,-148,24,-147]]})
  };
  const rules = freeze({
    ...expandedRules,
    bodyGap: 84,
    normals: [
      { damage: 36, push: 90, stun: .18, stop: .030, size: 9, lunge: 110 },
      { damage: 48, push: 110, stun: .20, stop: .034, size: 11, lunge: 135 },
      { damage: 60, push: 150, stun: .23, stop: .040, size: 14, lunge: 220 },
      { damage: 24, push: 85, stun: .18, stop: .025, size: 10, lunge: 120 },
      { damage: 84, push: 350, stun: .28, stop: .055, size: 20, lunge: 190 }
    ],
    upper: { damage: 54, push: 120, stun: .30, stop: .038, size: 16, lunge: 125, lift: -400,
      startup: .12, active: .13, recovery: .20 },
    heavy: { damage: 90, push: 340, stun: .28, stop: .050, size: 20, lunge: 100,
      startup: .14, active: .11, recovery: .25 },
    ranged: { damage: 42, push: 120, stun: .20, stop: .025, size: 21, speed: 620, distance: 780, radius: 12, cost: 12 },
    dashRanged: { damage: 58, push: 210, stun: .24, stop: .032, size: 25, speed: 780, distance: 950, radius: 14, cost: 22,
      startup: .25, active: .09, recovery: .22, dashStart: .04, dashEnd: .20, dashSpeed: 650 },
    rangedUp: { damage: 46, push: 100, stun: .25, stop: .030, size: 21, speed: 620, distance: 690, radius: 12, cost: 16,
      startup: .16, active: .09, recovery: .23, angle: -Math.PI / 5, lift: -280 },
    rangedLow: { damage: 50, push: 180, stun: .23, stop: .030, size: 23, speed: 570, distance: 760, radius: 13, cost: 18,
      startup: .17, active: .10, recovery: .25 },
    starAscend: { damage: 24, damages: [24, 24, 68], push: 90, stun: .26, stop: .028, size: 16, lunge: 150, lift: -420,
      cost: 65, startup: .16, active: .39, recovery: Math.max(.31, ascendVoice + .12 - .55), voiceDuration: ascendVoice,
      contactTimes: [.16, .28, .42], launchAt: .12, launchSpeed: -440 },
    starAscendFinish: { damage: 68, push: 220, stun: .30, stop: .050, size: 26, lift: -520, knockdown: true },
    starCounter: { cost: 40, startup: .16, active: .32, recovery: Math.max(.45, counterVoice + .12 - .48), voiceDuration: counterVoice,
      damage: 100, push: 340, stun: .32, stop: .045, size: 28, radius: 20, knockdown: true,
      contactTimes: [.16], chargeStart: .16, chargeEnd: .48, chargeDistance: 300, chargeSpeed: 300 / .32 },
    timeAmbush: { damage: 40, damages: [40, 56], push: 120, stun: .20, stop: .028, size: 18, cost: 60,
      startup: ambushBlink + .10, active: .16, recovery: .28, voiceDuration: ambushVoice,
      contactTimes: [ambushBlink + .10, ambushBlink + .20], blinkAt: ambushBlink, blinkDistance: 560,
      blinkInvStart: ambushBlink - .04, blinkInvEnd: ambushBlink + .05 },
    timeAmbushFinish: { damage: 56, push: 320, stun: .28, stop: .045, size: 26, knockdown: true },
    knifeArray: { cost: 55, startup: .22, active: Math.max(.68, knifeRelease + .42 - .22), recovery: .26,
      voiceDuration: knifeVoice, releaseStart: knifeRelease, releaseGap: .10,
      count: 5, angles: [.16, .08, 0, -.08, -.16] },
    knife: { damage: 18, push: 60, stun: .13, stop: .012, size: 8, speed: 850, distance: 860, radius: 6 },
    knifeFinish: { damage: 34, push: 240, stun: .24, stop: .030, size: 18,
      speed: 850, distance: 860, radius: 6, knockdown: true },
    burst: { cost: 50, cooldown: 12, radius: 300, centerY: 110, damage: 0, stun: .42, push: 620,
      inv: .65, cool: .18, poseDuration: .38, duration: .65 },
    assist: { damage: 78, push: 220, stun: .25, stop: .040, size: 28, speed: 560, distance: 650, radius: 19, height: 148 },
    super: { range: 800, vertical: 95, rushDamageTotal: 192, finalDamage: 108, rushChipTotal: 32, finalChip: 16,
      totalDamage: 300, totalChip: 48,
      push: 380, stun: .30, stop: .055, size: 30, standHeight: 182, rushRadius: 25, finalRadius: 76 }
  });
  // Zero-based contact index: [0, rushCount) are quick fists; rushCount is
  // the finisher. Integer milli-HP differences preserve the exact total while
  // giving every quick fist a positive, deterministic share of the damage.
  function superContactBudget(timeline, index, blocked = false) {
    const count = timeline.rushCount, p = { ...rules.super, ...timeline.budget };
    if (index >= count) {
      const damage = blocked ? p.finalChip : p.finalDamage;
      return { damage, damageMilli: damage * 1000 };
    }
    const ordinal = Math.max(0, Math.floor(index));
    const share = total => Math.floor((ordinal + 1) * total / count) - Math.floor(ordinal * total / count);
    const damageMilli = share((blocked ? p.rushChipTotal : p.rushDamageTotal) * 1000);
    return { damage: damageMilli / 1000, damageMilli };
  }
  const baseHeight = { jotaro: 221.51, dio: 223.21, giorno:220,kira:222,pucci:228,okuyasu:225 };
  // [fist/boot tip x, y] relative to the physical foot anchor. The sixth
  // contact is the fifth move; the fourth move has two authored punch frames.
  const tips = freeze({
    jotaro: [[137.31,-170.68],[112.65,-178.65],[103.17,-174.48],[127.82,-175.99],[134.65,-184.72],[153.24,-166.51]],
    dio: [[118.74,-177.74],[125.88,-184.13],[102.96,-186.38],[122.88,-175.86],[130.77,-172.10],[168.35,-172.86]],
    // Reviewed full-atlas source landmarks are recorded in expansion-*.json.
    // Store fixed base-height coordinates so loading art never changes physics.
    giorno: [[113.2131,-180.68732],[129.65634,-178.04116],[154.98274,-168.96902],[108.8659,-175.39522],[125.68732,-175.77318],[134.94844,-170.10312]],
    kira: [[118.842372,-185.40219],[122.864124,-192.239124],[157.65219,-180.576132],[115.624926,-186.206496],[120.250074,-185.804454],[140.760876,-174.945546]],
    pucci: [[138.765588,-187.11732],[141.51732,-184.365588],[169.034412,-180.827484],[111.051732,-187.510392],[125.203464,-180.434412],[163.137876,-174.930948]],
    okuyasu: [[127.6209,-186.290325],[135.887175,-184.677525],[184.2741,-181.8549],[111.492,-185.080725],[138.104775,-185.080725],[154.4355,-184.677525]]
  });
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const scale = f => (f.height || baseHeight[f.id] || 222) / (baseHeight[f.id] || 222);
  function profile(kind = 'melee') {
    const match = /^combo([1-5])$/.exec(kind);
    return match ? rules.normals[Number(match[1])-1] : rules[kind] || rules.normals[0];
  }
  function contactDuration(a, contact = 0) {
    if (a.type === 'starCounter') return a.active ?? rules.starCounter.active;
    const start = a.contactTimes?.[contact] ?? a.startup;
    const end = a.contactTimes?.[contact+1] ?? a.startup + a.active;
    return Math.min(.052, Math.max(.024, (end-start)*.65));
  }
  function strike(f, a = f.attack, contact = 0) {
    const authored=expandedRules[a?.type];
    if(authored?.points){const s=scale(f),dir=f.face<0?-1:1,index=clamp(contact,0,authored.points.length-1),[x,y,sx,sy]=authored.points[index];
      return{x:f.x+dir*x*s,y:f.y+y*s,startX:f.x+dir*sx*s,startY:f.y+sy*s,radius:(authored.radius||15)*s,scale:s,index,frame:authored.lift<0?5:authored.knockdown?14:2};}

    if (a?.type === 'starCounter') {
      const s = scale(f), dir = f.face < 0 ? -1 : 1, [x,y] = (tips[f.id] || tips.jotaro)[1];
      return { x: f.x + dir * x * s, y: f.y + y * s, startX: f.x + dir * 30 * s, startY: f.y - 160 * s,
        radius: rules.starCounter.radius * s, scale: s, index: 0, frame: 5 };
    }
    if (a?.type === 'starAscend' || a?.type === 'timeAmbush') {
      const ascend = a.type === 'starAscend', s = scale(f), dir = f.face < 0 ? -1 : 1;
      const points = ascend ? [[210,-205,35,-110],[230,-260,35,-120],[250,-320,28,-115]]
        : [[145,-162,32,-151],[168,-130,32,-146]];
      const index = clamp(contact, 0, points.length-1), [x,y,sx,sy] = points[index];
      return { x:f.x+dir*x*s, y:f.y+y*s, startX:f.x+dir*sx*s, startY:f.y+sy*s,
        radius:(ascend ? 20 : 12)*s, scale:s, index, frame:ascend ? [5,10,14][index] : [5,14][index] };
    }
    if (a?.type === 'upper' || a?.type === 'heavy') {
      const upper = a.type === 'upper', s = scale(f), dir = f.face < 0 ? -1 : 1;
      return { x: f.x + dir * (upper ? 115 : 150) * s, y: f.y + (upper ? -224 : -44) * s,
        startX: f.x + dir * (upper ? 30 : 26) * s, startY: f.y + (upper ? -72 : -60) * s,
        radius: (upper ? 11 : 12) * s, scale: s, index: upper ? 1 : 5, frame: upper ? 5 : 13 };
    }
    const combo = a?.type === 'heavy' ? 5 : a?.type === 'upper' ? 2 : clamp(a?.combo || 1,1,5);
    const index = combo === 5 ? 5 : combo === 4 ? 3 + Math.min(1,contact) : combo - 1;
    const [px,py] = (tips[f.id] || tips.jotaro)[index], s = scale(f), dir = f.face < 0 ? -1 : 1;
    const kick = combo === 3, radius = (kick ? 10 : combo === 5 ? 9 : 7) * s;
    return { x: f.x + dir*px*s, y: f.y+py*s,
      startX: f.x+dir*(kick ? -25 : 26)*s, startY: f.y+(py+(kick ? 16 : 8))*s,
      radius, scale: s, index, frame: [2,5,8,10,12,14][index] };
  }
  function castPoint(f, type = 'ranged') {
    const authored=expandedRules[type];
    if(authored?.projectile){const s=scale(f),dir=f.face<0?-1:1,y=authored.grounded?-authored.radius:authored.lane==='low'?-60:authored.angle<0?-186:-164;
      return{x:f.x+dir*85*s,y:f.y+y*s,startX:f.x+dir*30*s,startY:f.y+y*s,radius:authored.radius*s,scale:s};}

    if (['starCounter','starReversal','knifeArray','knife','knifeFinish'].includes(type)) {
      const s = scale(f), dir = f.face < 0 ? -1 : 1, knife = type.startsWith('knife');
      return { x:f.x+dir*(knife ? 80 : 100)*s, y:f.y-(knife ? 150 : 140)*s,
        startX:f.x+dir*28*s, startY:f.y-140*s, radius:(knife ? 6 : 26)*s, scale:s };
    }
    if (type === 'rangedUp' || type === 'rangedLow') {
      const upper = type === 'rangedUp', s = scale(f), dir = f.face < 0 ? -1 : 1;
      return { x: f.x + dir * (upper ? 90 : 115) * s, y: f.y + (upper ? -182 : -62) * s,
        radius: profile(type).radius * s, scale: s };
    }
    return strike(f, { type:'melee',combo:1 });
  }
  // Directional commands share authored body cues with their hurt regions.
  // A low stand attack uses the actual crouch drawing, keeping feet and scale.
  function commandPose(f, a = f.attack) {
    if(a&&expandedRules[a.type]){
      const p=profile(a.type),t=a.t||0,start=a.startup??p.startup,end=a.duration??start+p.active+p.recovery;
      const result=(sheet,index,phase,contactIndex=0)=>({sheet,index,phase,contactIndex});
      if(t>=end-1e-7)return result('motion',0,'ready');
      if(p.chargeStart!=null&&t>=p.chargeStart&&t<p.chargeEnd&&!a.chargeStopped)return result('motion',7,'charge-travel');
      if(t<start)return result('motion',p.lane==='low'||p.lift<0||a.type==='palmCrush'?13:14,'prepare',-1);
      const contacts=a.contactTimes||p.contactTimes||[start];
      for(let i=contacts.length-1;i>=0;i--)if(t>=contacts[i])return result('action',t<contacts[i]+.065?(p.lift<0?5:p.knockdown||i>1?14:i%2?5:2):3,t<contacts[i]+.065?'contact':'recover',i);
      return result('action',1,'prepare');
    }
    if (!a || !['upper', 'heavy', 'dashRanged', 'rangedUp', 'rangedLow', 'starAscend', 'starCounter', 'timeAmbush', 'knifeArray'].includes(a.type)) return null;
    const p = profile(a.type), startup = a.startup ?? p.startup, active = a.active ?? p.active;
    const duration = a.duration ?? startup + active + p.recovery, t = a.t || 0;
    const phase = t < startup ? 'prepare' : t < startup + contactDuration({ ...a, startup, active }) ? 'contact' : 'recover';
    const cue = (sheet, index, name = phase) => ({ sheet, index, phase: name, contactIndex: phase === 'prepare' ? -1 : 0 });
    if (t >= duration - 1e-7) return cue('motion', 0, 'ready');
    if (a.type === 'starCounter') {
      if (t < p.chargeStart) return cue('motion', 6, 'charge-prepare');
      if (t < p.chargeEnd && !a.chargeStopped) return cue('action', 5, 'charge-travel');
      if (a.hit && t < (a.chargeStoppedAt ?? p.chargeEnd) + .09) return cue('action', 5, 'charge-contact');
      return cue(t < p.chargeEnd + .14 ? 'motion' : 'action', t < p.chargeEnd + .14 ? 8 : 6, 'charge-brake');
    }
    if (a.type === 'starAscend' || a.type === 'timeAmbush') {
      const ascend = a.type === 'starAscend';
      if (ascend && t < p.launchAt) return cue('motion', t < p.launchAt*.65 ? 13 : 9, 'prepare');
      if (ascend && t < startup) return cue('motion', 10, 'ascend-rise');
      if (!ascend && t < p.blinkInvStart) return cue('motion', t < Math.max(.10, p.blinkInvStart - .10) ? 0 : 6, 'blink-mark');
      if (!ascend && t < p.blinkInvEnd) return cue('motion', 7, 'blink-hidden');
      const contacts = a.contactTimes || p.contactTimes;
      for (let index=contacts.length-1; index>=0; index--) if (t >= contacts[index]) {
        const hold = contactDuration({ ...a, startup, active, contactTimes:contacts }, index);
        if (t < contacts[index]+hold) return { ...cue('action', ascend ? [5,10,14][index] : [5,14][index], 'contact'), contactIndex:index };
        return { ...cue(ascend ? 'motion' : 'action', ascend ? (f.vy>100 ? 12 : 11) : 6,
          index < contacts.length-1 ? 'rebound' : 'recover'), contactIndex:index };
      }
      return cue('action', 4, 'prepare');
    }
    if (a.type === 'knifeArray') {
      if (t < startup) return cue('motion', 14, 'prepare');
      if (t < p.releaseStart) return cue('action', 1, 'knife-suspend');
      const index = Math.min(p.count-1, Math.floor((t-p.releaseStart+1e-9)/p.releaseGap));
      const throwing = t < p.releaseStart+index*p.releaseGap+.045;
      return { ...cue('action', throwing ? 2 : 1, throwing ? 'knife-release' : t < p.releaseStart+(p.count-1)*p.releaseGap ? 'knife-suspend' : 'recover'), contactIndex:index };
    }
    if (a.type === 'dashRanged') {
      if (t < p.dashStart) return cue('motion', 6, 'dash-prepare');
      if (t < p.dashEnd) return cue('motion', 7, 'dash-travel');
      if (t < startup) return cue('motion', 8, 'dash-brake');
      return cue('action', phase === 'contact' ? 2 : 3);
    }
    if (a.type === 'heavy' || a.type === 'rangedLow') return cue('motion', t < duration - .055 ? 13 : 0);
    if (t < startup) return cue('motion', t < startup * .65 ? 13 : 9);
    return cue('action', phase === 'contact' ? 5 : 6);
  }
  function hurtboxes(f) {
    const s = scale(f), j = f.id !== 'dio', m = f.motion || {};
    const number = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
    let dir = f.face < 0 ? -1 : 1, sheet = 'motion', frame = 0;
    const a = f.attack, cinema = f.cinematicPose;
    // This finite state mapping deliberately reads simulation data only. A late
    // image decode, missing atlas or different render rate cannot change damage.
    if (f.burstT > 0) {
      const progress = clamp(1-f.burstT/rules.burst.poseDuration,0,1);
      if (progress < .20) frame = 14;
      else if (progress < .50) { sheet = 'action'; frame = 4; }
      else frame = progress < .79 ? 14 : 0;
    } else if (cinema) {
      const p = number(cinema.progress), phase = cinema.phase;
      if (cinema.role === 'target') frame = cinema.blocked ? 14 : phase === 'freeze' ? 0 : 15;
      else if (phase === 'freeze') frame = 0;
      else if (phase === 'recover' && p >= .55) frame = 0;
      else { sheet = 'action'; frame = { approach: 1, rush: 10, finish: 14, recover: 15 }[phase] || 0; }
    } else if (f.guard || f.blockStun && f.stun > 0) frame = 14;
    else if (f.stun > 0) frame = 15;
    else if (a) {
      sheet = 'action';
      const combo = a.type === 'melee' ? clamp(Math.round(number(a.combo, 1)), 1, 5)
        : a.type === 'heavy' || a.type === 'super' ? 5 : a.type === 'upper' ? 2 : 1;
      const startup = Math.max(.025, number(a.startup, .06)), active = Math.max(.025, number(a.active, .08));
      const duration = Math.max(startup + active, number(a.duration, startup + active + .15));
      const t = clamp(number(a.t), 0, duration);
      const contacts = (Array.isArray(a.contactTimes) && a.contactTimes.length ? a.contactTimes : [startup])
        .filter(value => Number.isFinite(value) && value >= 0 && value < startup + active).slice(0, 2);
      if (!contacts.length) contacts.push(startup);
      const sequence = [[1,2,3],[4,5,6],[7,8,9],[11,10,11],[13,14,15]][combo-1];
      if (t >= Math.min(.008, startup * .12) && t < duration - 1e-7) {
        frame = sequence[0];
        for (let i = contacts.length - 1; i >= 0; i--) if (t >= contacts[i]) {
          const hold = contactDuration({ startup, active, contactTimes: contacts }, i);
          frame = t < contacts[i] + hold ? combo === 4 && i > 0 ? 12 : sequence[1] : sequence[2];
          break;
        }
      }
      const command = commandPose(f, a);
      if (command) { sheet = command.sheet; frame = command.index; }
    } else if (number(m.guard) > .15) frame = 14;
    else if (number(m.impact) > .12) frame = 15;
    else if (f.dash > 0 || number(m.dash) > .12) {
      frame = f.dash > .135 ? 6 : f.dash > .035 ? 7 : 8;
      dir = f.dashDir < 0 ? -1 : f.dashDir > 0 ? 1 : dir;
    } else {
      const grounded = typeof f.grounded === 'boolean' ? f.grounded
        : f.supportId != null && Number.isFinite(f.surfaceY) ? Math.abs(f.y-f.surfaceY) <= 2 : f.y >= 481;
      if (grounded && number(m.land) > .10) frame = 13;
      else if (!grounded) frame = number(m.takeoff) > .78 ? 9 : number(f.vy) < -100 ? 10 : number(f.vy) > 100 ? 12 : 11;
      else if (Math.abs(number(f.vx)) > 14 || number(m.move) > .1) frame = 2;
    }
    // Centers and extents are measured at the default 221.51/223.21 heights.
    // Head and rib cage can move independently; coat tails and extended attack
    // limbs do not turn the empty area around the body into a hurt rectangle.
    let pose = { hx: j ? 17 : 7, hy: j ? -197 : -200, hw: 34, hh: 44,
      tx: j ? 4 : 0, ty: j ? -134 : -136, tw: j ? 66 : 60, th: 108,
      lx: 0, ly: -43, lw: 100, lh: 76 };
    if (sheet === 'action') {
      const contact = {
        2: { hx: j ? 47 : 12, hy: -195, tx: j ? 28 : 5, ty: -132, lx: 9 },
        5: { hx: j ? 29 : 22, hy: -200, tx: j ? 15 : 15, ty: -137, lx: 5 },
        8: { hx: j ? -67 : -86, hy: -208, tx: j ? -62 : -65, ty: -143, tw: 56,
          lx: j ? -68 : -76, ly: -48, lw: 34, lh: 90 },
        10: { hx: j ? 54 : 32, hy: -199, tx: j ? 34 : 25, ty: -135, lx: 12 },
        12: { hx: 30, hy: j ? -204 : -198, tx: j ? 12 : 16, ty: -137, lx: 7 },
        14: { hx: j ? 61 : 68, hy: j ? -183 : -191, tx: j ? 44 : 50, ty: -127,
          lx: 18, ly: -43, lw: 112 }
      }[frame];
      if (contact) pose = { ...pose, ...contact };
      // The chamber and recoil pictures retain the side kick's retracted hip;
      // snapping their collider back to center would put it in blank space.
      else if (frame === 7 || frame === 9) pose = { ...pose, hx: j ? -60 : -63, hy: -202,
        tx: j ? -67 : -66, ty: -143, tw: 55, lx: -73, ly: -48, lw: 40, lh: 88 };
      else if (frame === 13) pose = { ...pose, hx: 43, hy: -179, tx: 18, ty: -120, lx: 9 };
      else if (frame === 4) pose = { ...pose, hx: 23, tx: 8, ty: -137 };
      else if (frame === 11) pose = { ...pose, hx: 37, tx: 22, ty: -135, lx: 8 };
    } else {
      const motionPose = {
        2: { hx: 34, hy: -195, tx: j ? 14 : 20, ty: -135, lx: 0, lw: 86 },
        6: { hx: j ? 42 : 30, hy: j ? -140 : -152, tx: 8, ty: -102, tw: 68, th: 78, lx: -1, ly: -32, lw: 110, lh: 58 },
        7: { hx: j ? 60 : 58, hy: -143, tx: 29, ty: -106, tw: 72, th: 72, lx: -17, ly: -44, lw: 105, lh: 64 },
        8: { hx: 25, hy: j ? -184 : -172, tx: 10, ty: -123, lx: 0 },
        9: { hx: j ? 37 : 30, hy: j ? -126 : -141, tx: 10, ty: j ? -88 : -101, tw: 66, th: 70, lx: -1, ly: -29, lw: 102, lh: 52 },
        10: { hx: j ? 23 : 36, hy: j ? -182 : -192, tx: j ? 5 : 18, ty: -137, th: 96,
          lx: j ? -16 : 20, ly: j ? -43 : -57, lw: j ? 90 : 96, lh: j ? 116 : 110 },
        11: { hx: 20, hy: -181, tx: 6, ty: -134, tw: 60, th: 84, lx: 8, ly: -65, lw: 80, lh: 58 },
        12: { hx: -2, hy: j ? -214 : -211, tx: -4, ty: -160, tw: 60, th: 100, lx: 9, ly: -58, lw: 65, lh: 110 },
        13: { hx: 35, hy: j ? -140 : -148, tx: 8, ty: -100, tw: 69, th: 76, lx: -1, ly: -31, lw: 108, lh: 56 },
        14: { hx: 9, hy: -203, hw: 38, tx: j ? 0 : -4, ty: -141, tw: 64, lx: -1 },
        15: { hx: j ? -65 : -53, hy: j ? -201 : -194, tx: -28, ty: -135, tw: 63, lx: 5 }
      }[frame];
      if (motionPose) pose = { ...pose, ...motionPose };
    }
    return [['head',pose.hx,pose.hy,pose.hw,pose.hh],['torso',pose.tx,pose.ty,pose.tw,pose.th],['legs',pose.lx,pose.ly,pose.lw,pose.lh]]
      .map(([part,x,y,w,h]) => ({ part, left: f.x+(dir*x-w/2)*s, right: f.x+(dir*x+w/2)*s,
        top: f.y+(y-h/2)*s, bottom: f.y+(y+h/2)*s }));
  }
  function targetPoint(f, dir = 1) {
    const torso = hurtboxes(f).find(box => box.part === 'torso'), s = scale(f);
    // Aim inside the current upper rib cage, not at a fixed standing-height
    // point. The side inset keeps the spark on the visible body at either face.
    const inset = Math.min(9*s, (torso.right-torso.left)*.22);
    return { x: dir > 0 ? torso.left+inset : torso.right-inset,
      y: torso.top+(torso.bottom-torso.top)*.24 };
  }
  // Segment against an expanded body region. This also accepts a limb that
  // crosses the torso at close distance, instead of requiring its tip to stop
  // precisely at the skin. The reported spark is clamped back onto the body.
  function segmentContact(x1,y1,x2,y2,r,box) {
    let lo=0,hi=1;
    for(const [start,delta,min,max] of [[x1,x2-x1,box.left-r,box.right+r],[y1,y2-y1,box.top-r,box.bottom+r]]) {
      if(Math.abs(delta)<1e-9){if(start<min||start>max)return null;continue;}
      let a=(min-start)/delta,b=(max-start)/delta;if(a>b)[a,b]=[b,a];
      lo=Math.max(lo,a);hi=Math.min(hi,b);if(lo>hi)return null;
    }
    return {x:clamp(x1+(x2-x1)*lo,box.left,box.right),y:clamp(y1+(y2-y1)*lo,box.top,box.bottom),fraction:lo};
  }
  function meleeContact(f,e,a=f.attack,contact=0) {
    if(f.knockdown || e.knockdown || (e.x-f.x)*(f.face<0?-1:1)<=0)return null;
    const p=strike(f,a,contact);
    const hits=hurtboxes(e).map(b=>segmentContact(p.startX,p.startY,p.x,p.y,p.radius,b)).filter(Boolean);
    return hits.sort((a,b)=>a.fraction-b.fraction)[0] || null;
  }
  // Pull effects show the same swept corridor tested by meleeContact, including
  // its near end. Radius stays unchanged when only horizontal reach increases.
  function pullArea(f, a=f.attack) {
    if (!profile(a?.type).pullCapture) return null;
    const point=strike(f,a),dir=f.face<0?-1:1;
    return {...point,dir,length:Math.abs(point.x-point.startX),
      left:Math.min(point.startX,point.x)-point.radius,
      right:Math.max(point.startX,point.x)+point.radius,
      top:Math.min(point.startY,point.y)-point.radius,
      bottom:Math.max(point.startY,point.y)+point.radius};
  }
  // A pull may close distance on its original side, but never exchange places.
  // This applies to a swept per-tick position as well as an instantaneous erase.
  function clampPullX(caster,target,proposedX,dir=caster.face,worldWidth=Infinity) {
    const side=dir<0?-1:1,gap=spacing(caster,target),edge=caster.x+side*gap;
    const value=Number.isFinite(proposedX)?proposedX:target.x;
    const near=side>0?Math.max(edge,value):Math.min(edge,value);
    const bounded=Math.max(30,Math.min(worldWidth-30,near));
    // A caster at the outward wall can leave no legal slot in front. A pull
    // then leaves the target in place instead of pushing it through that wall.
    if ((bounded-caster.x)*side<gap-1e-9) return target.x;
    return bounded;
  }
  function projectileContact(p,e,fromX=p.prevX,fromY=p.prevY) {
    if(e.knockdown)return null;
    const hits=hurtboxes(e).map(b=>segmentContact(fromX??p.x,fromY??p.y,p.x,p.y,p.r,b)).filter(Boolean);
    return hits.sort((a,b)=>a.fraction-b.fraction)[0] || null;
  }
  function canSuper(f,e) {
    if(f.knockdown || e.knockdown)return false;
    const dx=(e.x-f.x)*(f.face<0?-1:1);
    return dx>0 && dx<=rules.super.range*scale(f) && Math.abs(castPoint(f).y-targetPoint(e,f.face).y)<=rules.super.vertical*scale(f);
  }
  function burstArea(f) {
    const s = scale(f), p = rules.burst;
    return { x: f.x, y: f.y-p.centerY*s, radius: p.radius*s, scale: s };
  }
  function burstContact(f, e) {
    if (e.hp <= 0 || e.knockdown) return null;
    const area = burstArea(f);
    // A circular wave meets the visible body, irrespective of facing, guard
    // or ordinary invulnerability. Empty space above/below it is still safe.
    const hits = hurtboxes(e).map(box => {
      const x = clamp(area.x, box.left, box.right), y = clamp(area.y, box.top, box.bottom);
      return { x, y, distance: Math.hypot(x-area.x, y-area.y), part: box.part };
    }).filter(point => point.distance <= area.radius + 1e-9);
    return hits.sort((a,b) => a.distance-b.distance)[0] || null;
  }
  function burstProjectileContact(f, p) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
    const area = burstArea(f), radius = Number.isFinite(p.r) ? Math.max(0,p.r) : 0;
    // Instantaneous deflection uses the current projectile circle, never its
    // travelled trail or where the owner is standing.
    return Math.hypot(p.x-area.x,p.y-area.y) <= area.radius+radius+1e-9;
  }
  function spacing(a,b) { return rules.bodyGap*(scale(a)+scale(b))*.5; }
  return Object.freeze({rules,commandsFor,superTimeline,superTimelineFor,superContactBudget,tips,profile,scale,contactDuration,strike,castPoint,commandPose,hurtboxes,targetPoint,meleeContact,pullArea,clampPullX,projectileContact,canSuper,burstArea,burstContact,burstProjectileContact,spacing});
})();
