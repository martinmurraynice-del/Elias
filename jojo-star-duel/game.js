'use strict';
const canvas = document.querySelector('#game'), ctx = canvas.getContext('2d');
const $ = s => document.querySelector(s), W = 1100, H = 600, FLOOR = 483;
const FIXED_DT = 1 / 120, BUFFER_TIME = .18;
const MOVEMENT = Object.freeze({ jumpSpeed: 760, gravity: 1500, dashDuration: .22, dashSpeed: 1000, dashInv: .10 });
// One shared meter for normals, damage, skills and burst: 100 energy per stock.
const CombatEnergy = (() => {
  const max = 300, perStock = 100, initial = 0, hitGain = 12, blockGain = 5, damageRatio = .2;
  const clamp = value => Math.round(Math.max(0, Math.min(max, Number.isFinite(value) ? value : 0)) * 1e6) / 1e6;
  function gain(f, amount, training = false) {
    const before = clamp(f.energy);
    f.energy = training ? max : clamp(before + (Number.isFinite(amount) ? Math.max(0, amount) : 0));
    return f.energy - before;
  }
  const canSpend = (f, cost, training = false) => Number.isFinite(cost) && cost >= 0 && (training || clamp(f.energy) >= cost);
  function spend(f, cost, training = false) {
    if (!canSpend(f, cost, training)) return false;
    f.energy = training ? max : clamp(f.energy - cost);
    return true;
  }
  const receive = (f, damage, training = false) => gain(f, damage * damageRatio, training);
  const normal = (f, blocked, training = false) => gain(f, blocked ? blockGain : hitGain, training);
  const isNormal = (f, kind) => kind === 'melee' || /^combo[1-5]$/.test(kind)
    || [CombatGeometry.commandsFor(f.id).upper, CombatGeometry.commandsFor(f.id).heavy].includes(kind);
  return Object.freeze({ max, perStock, initial, hitGain, blockGain, damageRatio, clamp, gain, canSpend, spend, receive, normal, isNormal });
})();
// Phase-local seconds; air falls must touch a real support before the down timer.
const KNOCKDOWN_TIMING = Object.freeze({ fall: .20, down: .65, rise: .30, chainWindow: .50 });
const COMBO_MOVES = Object.freeze([
  { motionKey: 'jab', labels: ['试探直拳', '高速刺拳'], startup: .055, active: .085, recovery: .13, contactTimes: [.055] },
  { motionKey: 'cross', labels: ['反手追击', '交叉追拳'], startup: .065, active: .095, recovery: .13, contactTimes: [.065] },
  { motionKey: 'kick', labels: ['踏步侧踢', '前压侧踢'], startup: .085, active: .115, recovery: .18, contactTimes: [.085] },
  { motionKey: 'double', labels: ['白金双击', '世界双击'], startup: .075, active: .205, recovery: .18, contactTimes: [.075, .185] },
  { motionKey: 'finisher', labels: ['白金终结拳', '震退重拳'], startup: .12, active: .11, recovery: .30, contactTimes: [.12] }
].map((move,index) => Object.freeze({ ...move, lunge: CombatGeometry.rules.normals[index].lunge,
  labels: Object.freeze(move.labels), contactTimes: Object.freeze(move.contactTimes),
  damages: Object.freeze(move.contactTimes.map(() => CombatGeometry.rules.normals[index].damage)) })));
const COMBO_COUNT = COMBO_MOVES.length;
const EXPANDED_TYPES = Object.freeze(Object.keys(CombatGeometry.rules).filter(type=>CombatGeometry.rules[type]?.style));
const RANGED_TYPES = Object.freeze(['ranged', 'dashRanged', 'rangedUp', 'rangedLow',...EXPANDED_TYPES.filter(type=>CombatGeometry.rules[type].projectile)]);
const SIGNATURE_TYPES = Object.freeze(['starAscend', 'starCounter', 'timeAmbush', 'knifeArray','rootBloom','lifeBind','sheerHeart','chainBomb','heavenDrive','gravityWell','spaceErase','palmCrush']);
const DIRECTIONAL_TYPES = Object.freeze(['upper', 'heavy', 'dashRanged', 'rangedUp', 'rangedLow', ...SIGNATURE_TYPES,...EXPANDED_TYPES]);
const COMMAND_LABELS = Object.freeze({
  upper: Object.freeze(['白金升龙', '世界上挑']), heavy: Object.freeze(['白金低扫', '世界横扫']),
  ranged: Object.freeze(['白金拳波', '世界拳波']), dashRanged: Object.freeze(['白金突进拳波', '世界突进拳波']),
  rangedUp: Object.freeze(['白金升空拳波', '世界上升拳波']), rangedLow: Object.freeze(['白金贴地拳波', '世界低空拳波']),
  starAscend: Object.freeze(['白金·流星升击', '白金·流星升击']), starCounter: Object.freeze(['白金·绝境反击', '白金·绝境反击']),
  timeAmbush: Object.freeze(['世界·时隙闪袭', '世界·时隙闪袭']), knifeArray: Object.freeze(['世界·时锁刃阵', '世界·时锁刃阵'])
});

const SUPER_TIMELINE = CombatGeometry.superTimeline;
const SUPER_TIMING = SUPER_TIMELINE.phases;
const SUPER_DURATION = SUPER_TIMELINE.duration;
const CAMERA_VIEW = Object.freeze({ left: 50, right: 1050, top: 176, bottom: 544, centerY: 360 });
const camera = { x: 550, y: 360, zoom: 1, prevX: 550, prevY: 360, prevZoom: 1 };
const roster = {
  jotaro: { name: '空条承太郎', stand:'白金之星', color: '#b99cf0', height: 1303 * .17 * .8, speed: 330, range: 166 * .8, skill: '白金之星 · 欧拉连打' },
  dio: { name: 'DIO', stand:'世界', color: '#e6ce64', height: 1313 * .17 * .8, speed: 305, range: 156 * .8, skill: '世界 · 无駄连打' },
  giorno:{name:'乔鲁诺·乔巴拿',stand:'黄金体验',color:'#e9b6df',height:176,speed:322,range:134,skill:'黄金体验 · 生命连打'},
  kira:{name:'吉良吉影',stand:'杀手皇后',color:'#c3a6e7',height:177.6,speed:304,range:132,skill:'杀手皇后 · 连环爆破'},
  pucci:{name:'恩里克·普奇',stand:'天堂制造',color:'#e7e2ca',height:182.4,speed:354,range:132,skill:'天堂制造 · 时速连袭'},
  okuyasu:{name:'虹村亿泰',stand:'轰炸空间',color:'#79bdf1',height:180,speed:292,range:142,skill:'轰炸空间 · 三重削除'}
};
const held = new Set(), pressed = new Set(), pressedCommands = new Map();
let state = 'menu', selected = 'jotaro', selectedOpponent = 'dio', selectedStage = 'cairo', mode = 'cpu', difficulty = 'normal';
let fighters = [], shots = [], vfx = [], clock = 90, round = 1, wins = [0, 0];
let intro = 0, shake = 0, freeze = 0, banner = '', bannerT = 0, roundDelay = 0;
let last = null, acc = 0, simTime = 0, audioUnlockPending = null;
let cinematic = null;
const bindings = [
  { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', attack: 'KeyJ', jump: 'KeyK', dash: 'KeyL', ranged: 'KeyU', super: 'KeyI', assist: 'KeyO' },
  { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', attack: 'Digit1', jump: 'Digit2', dash: 'Digit3', ranged: 'Digit4', super: 'Digit5', assist: 'Digit6' }
];
const gameKeys = new Set(bindings.flatMap(b => Object.values(b)));
const normalize = code => code.replace('Numpad', 'Digit');
function clearPressed() { pressed.clear(); pressedCommands.clear(); }
function clearInput() {
  held.clear(); clearPressed(); fighters.forEach(f => { f.buffer = null; f.attackQueue.length = 0; f.comboWindow = 0; });
  syncAudio();
}
window.addEventListener('keydown', e => {
  const code = normalize(e.code);
  if (code === 'Escape') { if (!e.repeat) togglePause(); return; }
  if (state !== 'fight' || !gameKeys.has(code) || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName || '')) return;
  e.preventDefault();
  if (!held.has(code) && !e.repeat) {
    pressed.add(code);
    const binding = bindings.find(b => ['attack', 'jump', 'dash', 'ranged', 'super', 'assist'].some(key => b[key] === code));
    if (binding) pressedCommands.set(code, { left: held.has(binding.left), right: held.has(binding.right),
      up: held.has(binding.up), down: held.has(binding.down) });
  }
  held.add(code);
});
window.addEventListener('keyup', e => held.delete(normalize(e.code)));
window.addEventListener('blur', () => { clearInput(); if (state === 'fight') togglePause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'fight') togglePause(); });
document.querySelectorAll('[data-char]').forEach(b => b.onclick = () => {
  selected = b.dataset.char;
  document.querySelectorAll('[data-char]').forEach(x => { x.classList.toggle('selected', x === b); x.setAttribute?.('aria-pressed', String(x === b)); });
  updateMatchSelection();
});

function updateMatchSelection() {
  const map = Stage.catalog?.find(m => m.id === selectedStage);
  const summary = `${roster[selected].name} VS ${roster[selectedOpponent].name} · ${map?.name || '开罗 · 夜色'}`;
  if ($('#match-summary')) $('#match-summary').textContent = summary;
  if ($('#stage-label')) $('#stage-label').textContent = map?.name || '开罗 · 夜色';
}
if ($('#opponent')) $('#opponent').onchange = () => {
  if (roster[$('#opponent').value]) selectedOpponent = $('#opponent').value;
  updateMatchSelection();
};
document.querySelectorAll('[data-stage]').forEach(b => b.onclick = () => {
  if (!Stage.select?.(b.dataset.stage)) return;
  selectedStage = b.dataset.stage;
  document.querySelectorAll('[data-stage]').forEach(x => { x.classList.toggle('selected', x === b); x.setAttribute?.('aria-pressed', String(x === b)); });
  fighters = []; updateCamera(0, true); updateMatchSelection();
});
$('#mode').onchange = () => { $('#difficulty').disabled = $('#mode').value !== 'cpu'; };
$('#start').onclick = () => {
  unlockAudio();
  mode = $('#mode').value; difficulty = $('#difficulty').value; wins = [0, 0]; round = 1;
  $('#menu').classList.add('hidden'); newRound();
};
$('#pause').onclick = togglePause;
$('#back').onclick = () => {
  cancelSuper(); fighters.forEach(cancelHeldProjectiles);
  state = 'menu'; $('#result').classList.add('hidden'); $('#menu').classList.remove('hidden'); clearInput();
};
$('#continue').onclick = () => {
  unlockAudio();
  if (state === 'pause') togglePause();
  else { wins = [0, 0]; round = 1; $('#result').classList.add('hidden'); newRound(); }
};
$('#sound').onclick = () => {
  if (typeof JojoAudio === 'undefined') return;
  try {
    JojoAudio.setEnabled(!JojoAudio.enabled);
    $('#sound').textContent = '声音：' + (JojoAudio.enabled ? '开' : '关');
  } catch { /* Optional audio must never interrupt controls. */ }
  unlockAudio();
};
$('#fullscreen').onclick = async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('#arena').requestFullscreen(); }
  catch { $('#fullscreen').textContent = '全屏不可用'; }
};
// Kept for older callers; semantic combat events replace the electronic beep.
function tone() {}
function audioEvent(type, data) {
  if (typeof JojoAudio === 'undefined') return;
  try { JojoAudio.event(type, data); } catch { /* Audio failures cannot change combat. */ }
}
const audioCinematicIds = new WeakMap();
let nextAudioCinematicId = 0;
function syncAudio() {
  if (typeof JojoAudio === 'undefined') return;
  let voiceCue = null;
  if (cinematic && cinematic.owner.hp > 0 && (!cinematic.caught || cinematic.target.hp > 0)
    && (state === 'fight' || state === 'pause')) {
    const c = cinematic, voice = c.timeline.voice;
    const cue = c.t < voice.startEnd ? 'superStart'
      : voice.rushStart !== null && c.t >= voice.rushStart && c.t < voice.rushEnd ? 'superRush' : null;
    if (cue) {
      if (!audioCinematicIds.has(c)) audioCinematicIds.set(c, ++nextAudioCinematicId);
      voiceCue = { id: c.owner.id, cue, token: audioCinematicIds.get(c),
        offset: Math.max(0, cue === 'superStart' ? c.t : c.t - voice.rushStart) };
    }
  }
  try { JojoAudio.sync({ state, cinematic: !!cinematic, voiceCue }); } catch { /* Optional audio. */ }
}
function unlockAudio() {
  if (typeof JojoAudio === 'undefined') return;
  try {
    const result = JojoAudio.unlock();
    if (result && typeof result.then === 'function') {
      const pending = Promise.resolve(result); audioUnlockPending = pending;
      pending.then(() => { if (audioUnlockPending === pending) audioUnlockPending = null; syncAudio(); },
        () => { if (audioUnlockPending === pending) audioUnlockPending = null; });
      return pending;
    }
    syncAudio();
  } catch { /* A denied audio context leaves the game playable. */ }
}
function announceRound() {
  const currentFighters = fighters, currentRound = round;
  const data = { ids: fighters.map(f => f.id), round };
  const announce = () => {
    if (state === 'fight' && fighters === currentFighters && round === currentRound) audioEvent('round', data);
  };
  // Only the first round's sound waits for the user-gesture unlock. The match
  // itself starts immediately, and a cancelled round is never replayed later.
  if (audioUnlockPending) audioUnlockPending.then(announce, () => {});
  else announce();
}
function createMotion() {
  return { move: 0, travel: 0, air: 0, guard: 0, dash: 0,
    takeoff: 0, land: 0, turn: 0, impact: 0, impactDir: 0 };
}
// Visual follow-through runs on the same clock as combat, without delaying input.
function updateMotion(f, dt) {
  const m = f.motion;
  const speed = Math.max(-1, Math.min(1, f.vx / f.speed));
  const moving = !f.knockdown && !f.attack && !f.cinematicPose && f.dash <= 0 && f.stun <= 0 ? Math.abs(speed) : 0;
  const approach = (key, target, rate) => { m[key] += (target - m[key]) * (1 - Math.exp(-rate * dt)); };
  approach('move', moving, moving > m.move ? 16 : 12);
  approach('travel', speed, 16);
  approach('air', f.grounded ? 0 : 1, 22);
  approach('guard', f.guard || (f.blockStun && f.stun > 0) ? 1 : 0, 8);
  approach('dash', f.dash > 0 ? 1 : 0, f.dash > 0 ? 32 : 18);
  for (const [key, duration] of [['takeoff', .16], ['land', .24], ['turn', .18], ['impact', .20]])
    m[key] = Math.max(0, m[key] - dt / duration);
}
function createFighter(id, x, side) {
  return { id, ...roster[id], x, y: FLOOR, prevX: x, prevY: FLOOR, vx: 0, vy: 0, face: side,
    hp: 1000, energy: mode === 'training' ? CombatEnergy.max : CombatEnergy.initial, stun: 0, blockStun: false, inv: 0, cool: 0, dash: 0, dashDir: side,
    attack: null, buffer: null, attackQueue: [], combo: 0, comboWindow: 0, comboLabel: '', comboDisplay: 0,
    moveNotice: '', moveNoticeT: 0, jumps: 0, guard: false, burstT: 0,
    motion: createMotion(), prevMotion: createMotion(),
    knockdown: null, rootT: 0, bombMark: null, pullState: null, receivedHits: 0, receivedHitT: 0, receivedHitDir: side,
    grounded: true, supportId: 'floor', surfaceY: FLOOR, shadowY: FLOOR, dropTimer: 0, dropId: null,
    assistCd: 0, standT: 0, standAge: 0, standDetached: false, ai: 0, chain: 0, chainT: 0, runPhase: 0, motionTime: 0 };
}
function newRound() {
  cancelSuper();
  Stage.select?.(selectedStage);
  const spawns = Stage.spawnPoints || [Stage.width / 2 - 210, Stage.width / 2 + 210];
  fighters = [createFighter(selected, spawns[0], 1), createFighter(roster[selectedOpponent] ? selectedOpponent : 'dio', spawns[1], -1)];
  shots = []; vfx = []; clock = 90; intro = 1.3; roundDelay = 0; freeze = 0; shake = 0;
  state = 'fight'; clearInput(); bannerT = 0;
  updateCamera(0, true);
  announceRound();
  $('#arena-mode').textContent = mode === 'training' ? '试招练习 / 无限气 / 援助与爆气无冷却' : '三局两胜 / 90 秒 / 键盘操作';
}
function togglePause() {
  if (state === 'fight') {
    state = 'pause'; clearInput(); showResult('PAUSED', '对战暂停', '休息一下，下一招随时继续。', '继续对战 →');
  } else if (state === 'pause') {
    state = 'fight'; clearInput(); $('#result').classList.add('hidden');
  }
}
function showResult(label, title, detail, action) {
  $('#result-label').textContent = label; $('#result-title').textContent = title;
  $('#result-detail').textContent = detail; $('#continue').textContent = action; $('#result').classList.remove('hidden');
  syncAudio();
}
// Visual events contain snapshots, never live fighter references or game-state callbacks.
function emitVfx(type, owner, x, y, options = {}) {
  const event = { type, ownerId: owner.id, x, y, dir: options.dir ?? owner.face,
    age: 0, duration: options.duration ?? .45, power: options.power ?? 1, kind: options.kind ?? 'melee',
    scale: CombatGeometry.scale(owner), size: options.size ?? CombatGeometry.profile(options.kind).size ?? 24,
    cinematic: !!options.cinematic, final: !!options.final };
  if (Number.isFinite(options.radius) && options.radius >= 0) event.radius = options.radius;
  if (vfx.length >= 48) vfx.shift();
  vfx.push(event);
  const audioType = options.audioType || type;
  audioEvent(audioType, { ...event, type: audioType, id: owner.id, face: event.dir });
  return event;
}
function input(index) {
  const r = {};
  for (const [k, v] of Object.entries(bindings[index]))
    r[k] = ['left', 'right', 'up', 'down'].includes(k) ? held.has(v) : pressed.has(v);
  const cmd = ['super', 'assist', 'jump', 'dash', 'attack', 'ranged'].find(key => r[key]);
  if (cmd) r.commandSnapshot = pressedCommands.get(bindings[index][cmd]);
  return r;
}
function cpu(f, e, dt) {
  if (f.knockdown || f.receivedHits >= 3 || e.knockdown || f.hp <= 0 || e.hp <= 0) return {};
  const dist = Math.abs(f.x - e.x), vertical = Math.abs(f.y - e.y);
  // The CPU chooses to turn through its controls; human facing never tracks an
  // opponent's position. Movement toward a platform takes precedence over aim.
  const r = { turn: Math.sign(e.x - f.x) || f.face }, aimed = { ...f, face: Math.sign(e.x - f.x) || f.face }; f.ai -= dt;
  if (dist > f.range * .68) { r.left = f.x > e.x; r.right = !r.left; }
  const goal = Stage.supportAt(e.x, e.y) || Stage.surfaceBelow(e.x, e.y);
  if (f.grounded) {
    f.aiPlatform = null;
    if (goal.y < f.y - 55) {
      const nodes = [{ id: 'floor', x: 0, y: FLOOR, w: Stage.width }, ...Stage.platforms];
      const start = nodes.find(p => p.id === f.supportId), costs = new Map(), visited = new Set();
      if (start) costs.set(start.id, { cost: 0, first: null });
      // Ascending routes prevent the CPU getting trapped beneath a high target.
      // A 340px route limit leaves headroom below the double-jump apex (~380px).
      while (costs.size > visited.size) {
        const current = nodes.filter(p => costs.has(p.id) && !visited.has(p.id))
          .sort((a, b) => costs.get(a.id).cost - costs.get(b.id).cost)[0];
        if (!current || current.id === goal.id) break;
        visited.add(current.id);
        for (const next of nodes) {
          const rise = current.y - next.y;
          const gap = Math.max(0, next.x - current.x - current.w, current.x - next.x - next.w);
          if (rise < 15 || rise > 340 || gap > 320) continue;
          const sourceX = current.id === start.id ? f.x : Math.max(current.x + 32, Math.min(current.x + current.w - 32, e.x));
          const entryX = Math.max(next.x + 32, Math.min(next.x + next.w - 32, sourceX));
          const cost = costs.get(current.id).cost + Math.abs(entryX - sourceX) + rise * 1.25 + 100;
          if (!costs.has(next.id) || cost < costs.get(next.id).cost)
            costs.set(next.id, { cost, first: costs.get(current.id).first || next.id });
        }
      }
      f.aiPlatform = costs.get(goal.id)?.first || null;
    }
  }
  const route = Stage.platforms.find(p => p.id === f.aiPlatform);
  if (route) {
    // Aim at the near edge until landing, rather than walking off the current
    // roof to reach a takeoff point beneath the destination's distant center.
    const aimX = Math.max(route.x + 32, Math.min(route.x + route.w - 32, f.x));
    r.left = f.x > aimX + 8; r.right = f.x < aimX - 8;
    const inJumpRange = Math.abs(aimX - f.x) < 335;
    if ((f.grounded && inJumpRange) || (!f.grounded && f.jumps === 1 && f.vy > -85 && f.y > route.y + 1)) r.jump = true;
  }
  if (f.ai <= 0) {
    f.ai = difficulty === 'hard' ? .17 : difficulty === 'easy' ? .6 : .29;
    const roll = Math.random();
    if (!route) {
      if (e.attack && dist < 150 && vertical < 100 && roll < .5) f.aiGuard = .24;
      if (CombatGeometry.meleeContact(aimed,e,{type:'melee',combo:1}) || dist < 115 && vertical < 60) { r.attack = true; r.up = roll < .12; r.down = roll > .91; }
      else if (vertical < 90 && roll < .5) r.ranged = true;
      if (dist > 280 && roll > .7) r.dash = true;
      if (roll < .035) r.jump = true;
      if (f.grounded && f.supportId !== 'floor' && e.y > f.y + 80 && dist < 180) { r.down = true; r.jump = true; }
      if (!['jotaro','dio'].includes(f.id) && dist<430 && vertical<130 && roll>.52 && roll<.9) {
        const kit=CombatGeometry.commandsFor(f.id), up=roll<.73, type=up?kit.upSkill:kit.downSkill;
        if(f.energy>=CombatGeometry.profile(type).cost){r.super=true;r.up=up;r.down=!up;}
      } else if (f.energy >= 100 && CombatGeometry.canSuper(aimed,e)) r.super = true;
      if (f.assistCd <= 0 && f.hp < 750) r.assist = true;
    }
  }
  f.aiGuard = route ? 0 : Math.max(0, (f.aiGuard || 0) - dt); r.down = r.down || f.aiGuard > 0;
  return r;
}
function clearCombo(f) {
  f.comboWindow = 0; f.comboDisplay = 0; f.attackQueue.length = 0;
  if (f.buffer?.cmd === 'attack' && !f.buffer.up && !f.buffer.down) f.buffer = null;
}
function beginKnockdown(f, dir, reason) {
  if (f.knockdown) return;
  clearPull(f);
  cancelHeldProjectiles(f);
  f.knockdown = { phase: 'fall', t: 0, dir: dir < 0 ? -1 : 1, reason };
  f.attack = null; f.buffer = null; clearCombo(f);
  f.guard = false; f.blockStun = false; f.stun = 0; f.dash = 0; f.cool = 0;
  f.standT = 0; f.standDetached = false; f.aiGuard = 0; f.aiPlatform = null;
  f.receivedHits = 0; f.receivedHitT = 0;
  f.inv = Math.max(f.inv, .05);
}
function updateKnockdown(f, dt) {
  const kd = f.knockdown;
  if (!kd) {
    // Give deliberate follow-up taps time to connect, including the gap between
    // the fourth move's second punch and the finishing punch.
    if (f.receivedHits >= 3 && f.receivedHitT <= 0) beginKnockdown(f, f.receivedHitDir, 'chain');
    else if (f.receivedHitT <= 0) f.receivedHits = 0;
    return;
  }
  f.buffer = null; clearCombo(f); f.guard = false; f.inv = Math.max(f.inv, .05);
  kd.t += dt;
  if (kd.phase === 'fall') {
    if (f.grounded && kd.t + 1e-9 >= KNOCKDOWN_TIMING.fall) {
      kd.phase = 'down'; kd.t = 0; f.vx = 0; f.vy = 0;
      audioEvent('knockdown', { id: f.id, x: f.x, y: f.y, face: f.face, reason: kd.reason });
    }
  } else if (!f.grounded) {
    // A support can be lost at its edge while the body is settling.
    kd.phase = 'fall'; kd.t = KNOCKDOWN_TIMING.fall;
  } else if (kd.phase === 'down' && kd.t + 1e-9 >= KNOCKDOWN_TIMING.down) {
    if (f.hp <= 0 && mode !== 'training') kd.t = KNOCKDOWN_TIMING.down;
    else { kd.phase = 'rise'; kd.t = 0; }
  } else if (kd.phase === 'rise' && kd.t + 1e-9 >= KNOCKDOWN_TIMING.rise) {
    f.knockdown = null; f.vx = 0; f.vy = 0; f.stun = 0; f.inv = .06;
    f.motion.impact = 0; f.motion.land = 0;
  }
}
function plainAttack(command) { return command?.cmd === 'attack' && !command.up && !command.down; }
function rangedType(command, f) {
  const slot=command.up?'rangedUp':command.down?'rangedLow':command.horizontal?'dashRanged':'ranged';
  return f?CombatGeometry.commandsFor(f.id)[slot]:slot;
}
function specialType(f, command) {
  const kit=CombatGeometry.commandsFor(f.id);return command.up?kit.upSkill:command.down?kit.downSkill:'super';
}
function blinkInvulnerable(f) {
  const a = f.attack, spec = CombatGeometry.rules.timeAmbush;
  return a?.type === 'timeAmbush' && a.t + 1e-9 >= spec.blinkInvStart && a.t < spec.blinkInvEnd - 1e-9;
}
function inputDirection(r) {
  return (r.right ? 1 : 0) - (r.left ? 1 : 0) || (r.turn === -1 || r.turn === 1 ? r.turn : 0);
}
function setFacing(f, dir) {
  if (!dir) return;
  dir = dir < 0 ? -1 : 1;
  if (dir !== f.face) f.motion.turn = 1;
  f.face = dir;
  // The dash-braking sprite and hurtbox also read dashDir. Once the dash has
  // ended, they must follow a newly chosen direction instead of its old trail.
  if (f.dash <= 0) f.dashDir = dir;
}
function comboBufferLife(f) {
  return f.attack?.type === 'melee' ? Math.max(.28, (f.attack.combo === COMBO_COUNT ? f.attack.duration : f.attack.startup + f.attack.active) - f.attack.t + .22) : BUFFER_TIME;
}
// One immediate intention plus one extra deliberate normal-attack tap. Holding
// the key never fills this queue; modifiers and other actions replace it.
function queueInput(f, r) {
  if (f.knockdown || f.receivedHits >= 3 || f.hp <= 0) { f.buffer = null; clearCombo(f); return; }
  const cmd = ['super', 'assist', 'jump', 'dash', 'attack', 'ranged'].find(key => r[key]);
  if (!cmd) { if (r.down) clearCombo(f); return; }
  const modifiers = r.commandSnapshot || r;
  // Defensive burst is an immediate key edge, never a queued assist. Failed
  // attempts must not become an ordinary summon when control returns.
  if (cmd === 'assist' && modifiers.down) return;
  const command = { cmd, up: !!modifiers.up, down: !!modifiers.down,
    horizontal: (modifiers.right ? 1 : 0) - (modifiers.left ? 1 : 0),
    dir: inputDirection(modifiers), life: BUFFER_TIME };
  if (plainAttack(command) && (f.attack?.type === 'melee' || plainAttack(f.buffer))) {
    command.life = comboBufferLife(f);
    if (plainAttack(f.buffer)) { if (!f.attackQueue.length) f.attackQueue.push(command); }
    else { f.attackQueue.length = 0; f.buffer = command; }
  } else { f.attackQueue.length = 0; f.buffer = command; }
}
function promoteAttack(f) {
  if (!f.buffer && f.attackQueue.length) {
    f.buffer = f.attackQueue.shift(); f.buffer.life = comboBufferLife(f);
  }
}
function makeAttack(f, type, combo = 1) {
  const move = type === 'melee' ? COMBO_MOVES[Math.max(0, Math.min(COMBO_COUNT - 1, combo - 1))] : null;
  const spec = CombatGeometry.profile(type);
  const timing = move ? [move.startup, move.active, move.recovery]
    : Number.isFinite(spec.startup) ? [spec.startup, spec.active, spec.recovery]
    : type === 'super' ? [.14, .10, .27] : [.075, .07, .15];
  const [startup, active, recovery] = timing;
  const contactTimes = move?.contactTimes || spec.contactTimes || [startup];
  f.attack = { type, t: 0, startup, active, duration: startup + active + recovery, hit: false, fired: false, combo,
    motionKey: move?.motionKey || type, label: move ? (f.id==='jotaro'||f.id==='dio'?move.labels[f.id==='jotaro'?0:1]:['试探直拳','反手追击','踏步侧踢',f.stand+'·双击',f.stand+'·终结拳'][combo-1]) : spec.label || COMMAND_LABELS[type]?.[f.id === 'dio' ? 1 : 0],
    contactTimes, contactIndex: 0, contactsHit: contactTimes.map(() => false), contactResolved: contactTimes.map(() => false),
    damages: move?.damages || spec.damages || [spec.damage || 50],
    finisher: type === 'heavy' || (type === 'melee' && combo === COMBO_COUNT),
    lunge: move?.lunge || spec.lunge || 0 };
  if (move) { f.comboLabel = f.attack.label; f.comboDisplay = f.attack.duration + .65; f.moveNoticeT = 0; }
  else if (f.attack.label) { f.moveNotice = f.attack.label; f.moveNoticeT = .8; }
  f.guard = false; f.cool = 0; f.burstT = 0;
  f.standT = f.attack.duration + (DIRECTIONAL_TYPES.includes(type) ? 0 : .15);
  f.standAge = 0; f.standDetached = false;
  if (type === 'starCounter') Object.assign(f.attack, { chargeStarted: false, chargeStopped: false, chargeTravel: 0 });
  if (type === 'starAscend') f.attack.launched = false;
  if (type === 'timeAmbush') f.attack.blinked = false;
  audioEvent('action', { id: f.id, kind: type, combo, face: f.face, x: f.x, y: f.y });
  if (SIGNATURE_TYPES.includes(type)) {
    const hand = CombatGeometry.castPoint(f, type);
    emitVfx('cast', f, hand.x, hand.y, { kind: type, power: 2, duration: .38 });
  }
  if (type === 'super') { const hand=CombatGeometry.castPoint(f); emitVfx('cast', f, hand.x, hand.y, { kind:type, power:3, duration:.38 }); }
}
function action(f, r) {
  if (f.knockdown || f.receivedHits >= 3 || f.hp <= 0) { f.buffer = null; clearCombo(f); f.guard = false; return; }
  // Keep each active move and hit reaction facing its original direction.
  // A fresh direction is accepted while free, or when the next move starts.
  if (!f.attack && f.dash <= 0 && f.stun <= 0) setFacing(f, inputDirection(r));
  queueInput(f, r);
  const grounded = f.grounded;
  f.guard = !!r.down && grounded && !f.attack && f.dash <= 0 && (f.stun <= 0 || f.blockStun);
  const command = f.buffer;
  if (!command || f.stun > 0) return;
  const { cmd } = command, a = f.attack;
  if (a) {
    const kit=CombatGeometry.commandsFor(f.id);
    const melee = ['melee',kit.upper,kit.heavy].includes(a.type);
    const chain = cmd === 'attack' && a.type === 'melee' && a.combo < COMBO_COUNT && a.t >= a.startup + a.active;
    const cancel = melee && !(a.type === 'melee' && a.combo === COMBO_COUNT) && a.hit && a.t >= a.startup + a.active && ['jump', 'dash', 'ranged', 'super'].includes(cmd);
    if (!chain && !cancel) return;
  } else if (f.cool > 0) return;
  if (f.dash > 0 && !(f.dash < .09 && ['jump', 'attack', 'ranged'].includes(cmd))) return;
  if (cmd === 'jump' && f.jumps >= 2) return; // Retain a near-landing jump until it can execute.
  if (f.rootT > 0 && ['jump','dash'].includes(cmd)) return;
  const ranged = cmd === 'ranged' ? rangedType(command,f) : null;
  const special = cmd === 'super' ? specialType(f, command) : null;
  const specialCost = special === 'super' ? CombatEnergy.perStock : special ? CombatGeometry.profile(special).cost : 0;
  f.buffer = null;
  const requiredEnergy = special ? specialCost : ranged ? CombatGeometry.profile(ranged).cost : 0;
  if (!CombatEnergy.canSpend(f, requiredEnergy, mode === 'training')) {
    f.moveNotice = '能量不足 · 需要 ' + requiredEnergy + ' 气'; f.moveNoticeT = .8; return;
  }
  if (cmd === 'assist' && f.assistCd > 0) return;
  if (!plainAttack(command)) clearCombo(f);
  if (a && DIRECTIONAL_TYPES.includes(a.type)) f.standT = 0;
  f.attack = null; f.guard = false; f.dash = 0; f.burstT = 0;
  setFacing(f, command.dir || inputDirection(r));
  if (cmd === 'jump') {
    if (command.down && grounded && f.supportId !== 'floor') {
      f.dropId = f.supportId; f.dropTimer = .18; f.y += 3; f.vy = 60; f.jumps = 1;
    } else { f.vy = -MOVEMENT.jumpSpeed; f.jumps++; f.motion.takeoff = 1; f.motion.land = 0; emitVfx('land', f, f.x, f.y, { duration: .3, audioType: 'jump' }); }
    f.grounded = false; f.supportId = null; return;
  }
  if (cmd === 'dash') {
    f.dash = MOVEMENT.dashDuration; f.dashDir = command.dir || f.face; f.inv = Math.max(f.inv, MOVEMENT.dashInv);
    f.dashOrigin = { x: f.x, y: f.y };
    emitVfx('dash', f, f.x, f.y - 8, { dir: f.dashDir, duration: .32 }); return;
  }
  if (cmd === 'super') {
    CombatEnergy.spend(f, specialCost, mode === 'training');
    makeAttack(f, special); return;
  }
  if (cmd === 'assist') { f.standT = .65; f.standAge = 0; f.assistCd = mode === 'training' ? 0 : CombatGeometry.rules.burst.cooldown; f.cool = .18; projectile(f, 'assist'); return; }
  if (cmd === 'attack') {
    const kit=CombatGeometry.commandsFor(f.id),type = command.up ? kit.upper : command.down ? kit.heavy : 'melee';
    f.combo = type === 'melee' && f.comboWindow > 0 ? f.combo % COMBO_COUNT + 1 : 1;
    f.comboWindow = type === 'melee' ? .65 : 0; makeAttack(f, type, f.combo); promoteAttack(f); return;
  }
  if (ranged) { CombatEnergy.spend(f, CombatGeometry.profile(ranged).cost, mode === 'training'); makeAttack(f, ranged); }
}
function projectile(f, type) {
  if (type === 'assist') f.standDetached = true;
  const {x,y,startX,startY} = CombatGeometry.castPoint(f,type), spec = CombatGeometry.profile(type), s=CombatGeometry.scale(f);
  const angle = spec.angle || 0, vx = f.face * spec.speed * Math.cos(angle), vy = spec.speed * Math.sin(angle);
  shots.push({ owner: f, x, y, prevX: x, prevY: y, vx, vy,
    originX:startX, originY:startY, r: spec.radius*s, damage: spec.damage,
    t: spec.distance*s/Math.hypot(vx,vy), age: 0, type, homing:!!spec.homing, grounded:!!spec.grounded });
  if (type === 'assist') emitVfx('assist', f, x, y, { kind: type, power: 2, duration: .45 });
  else emitVfx('cast', f, x, y, { kind: type, power: 1, duration: .3 });
}
function cancelHeldProjectiles(f) {
  shots = shots.filter(p => !(p.held && p.owner === f));
}
function burstInputs() {
  const rule = CombatGeometry.rules.burst, accepted = [];
  fighters.forEach((f, i) => {
    if (i === 1 && mode === 'cpu') return;
    const binding = bindings[i], key = binding.assist;
    if (!pressed.has(key)) return;
    const snapshot = pressedCommands.get(key);
    if (!(snapshot ? snapshot.down : held.has(binding.down))) return;
    // Consume both players' edges before anything clears shared input state.
    pressed.delete(key); pressedCommands.delete(key);
    if (f.hp <= 0) return;
    const controlled = f.stun > 0 || f.receivedHits >= 3 || f.knockdown
      || (cinematic?.locked && cinematic.target === f);
    if (!controlled && (f.attack || f.dash > 0)) return;
    if (mode !== 'training' && (f.energy < rule.cost || f.assistCd > 0)) {
      f.moveNotice = f.energy < rule.cost ? '爆气需要50气' : '援助/爆气冷却中'; f.moveNoticeT = .8;
      return;
    }
    accepted.push(f);
  });
  if (!accepted.length) return false;
  const actors = new Set(accepted), movie = cinematic;
  // Snapshot collisions before any escape changes a pose or interrupts the
  // movie. Simultaneous waves cannot steal the second player's key or stun it.
  const plans = accepted.map(f => ({ f, area: CombatGeometry.burstArea(f),
    targets: fighters.filter(e => e !== f && CombatGeometry.burstContact(f,e)) }));
  const removed = new Set(shots.filter(p => plans.some(({f}) => p.owner !== f && CombatGeometry.burstProjectileContact(f,p))));
  const breaksMovie = movie && (accepted.some(f => movie.locked && movie.target === f)
    || plans.some(plan => plan.targets.includes(movie.owner)));
  if (breaksMovie) { cancelSuper('interrupted', true); cancelHeldProjectiles(movie.owner); }
  const interrupt = f => {
    clearPull(f);
    f.attack = null; f.dash = 0; f.guard = false; f.buffer = null; clearCombo(f);
    f.standT = 0; f.standDetached = false; f.cinematicPose = null;
    f.receivedHits = 0; f.receivedHitT = 0; f.blockStun = false;
    cancelHeldProjectiles(f);
  };
  for (const {f} of plans) {
    interrupt(f);
    CombatEnergy.spend(f, rule.cost, mode === 'training');
    if (mode !== 'training') { f.assistCd = rule.cooldown; }
    else f.assistCd = 0;
    f.stun = 0; f.knockdown = null; f.rootT = 0; f.bombMark = null; f.vx = 0;
    f.inv = Math.max(f.inv, rule.inv); f.cool = rule.cool; f.burstT = rule.poseDuration;
    f.motion.impact = 0; f.motion.guard = 0; f.motion.dash = 0;
  }
  for (const {f,area,targets} of plans) {
    for (const target of targets) {
      if (actors.has(target)) continue;
      interrupt(target);
      const dir = Math.sign(target.x-area.x) || f.face;
      target.stun = rule.stun; target.vx = dir*rule.push*CombatGeometry.scale(target);
      target.burstT = 0; target.motion.impact = 1; target.motion.impactDir = dir;
    }
    emitVfx('burst',f,area.x,area.y,{kind:'burst',radius:area.radius,power:3,duration:rule.duration});
  }
  shots = shots.filter(p => !removed.has(p));
  freeze = 0; clearPressed();
  return true;
}
function createKnifeArray(f, a) {
  const spec = CombatGeometry.rules.knifeArray, s = CombatGeometry.scale(f), dir = f.face;
  for (let index = 0; index < spec.count; index++) {
    const type = index === spec.count - 1 ? 'knifeFinish' : 'knife', blade = CombatGeometry.profile(type);
    const angle = spec.angles[index], x = f.x + dir * (70 + 13 * index) * s, y = f.y - (198 - 24 * index) * s;
    shots.push({ owner: f, type, x, y, prevX: x, prevY: y, originX: x, originY: y,
      vx: dir * blade.speed * Math.cos(angle), vy: blade.speed * Math.sin(angle),
      r: blade.radius * s, damage: blade.damage, t: blade.distance * s / blade.speed,
      held: true, sourceAttack: a, releaseAt: spec.releaseStart + spec.releaseGap * index,
      knifeIndex: index, index, angle, hoverAge: 0, age: 0 });
  }
  a.fired = true;
}
function hit(f, e, damage, dir, upper = false, finisher = false, kind = upper ? 'upper' : 'melee', contact = null, outcome = null) {
  if (e.knockdown || e.hp <= 0) return false;
  if (e.inv > 0 || blinkInvulnerable(e)) return false;
  const block = e.guard && e.face === -dir;
  const previousHp = e.hp;
  clearPull(e);
  e.motion.impact = block ? .45 : 1; e.motion.impactDir = dir;
  e.hp = Math.max(0, e.hp - (block ? Math.round(damage * .15) : damage));
  CombatEnergy.receive(e, previousHp - e.hp, mode === 'training');
  if (previousHp > e.hp && CombatEnergy.isNormal(f, kind)) CombatEnergy.normal(f, block, mode === 'training');
  const feel = CombatGeometry.profile(kind==='melee' && finisher ? 'heavy' : kind);
  e.stun = block ? .09 : feel.stun;
  e.blockStun = block; e.inv = block ? .04 : .075;
  e.vx = dir * (block ? 55 : feel.push) * CombatGeometry.scale(e);
  if (!block) {
    if (cinematic?.owner === e && cinematic.interactive) cancelSuper('interrupted', true);
    cancelHeldProjectiles(e);
    if (e.attack && DIRECTIONAL_TYPES.includes(e.attack.type)) e.standT = 0;
    e.attack = null; e.dash = 0; e.guard = false; e.buffer = null; clearCombo(e);
    if (upper) { e.vy = feel.lift ?? CombatGeometry.rules.upper.lift; e.y -= 2; e.jumps = Math.max(1, e.jumps); e.grounded = false; e.supportId = null; }
    f.chain = f.chainT > 0 ? f.chain + 1 : 1; f.chainT = .85;
    e.receivedHits = e.receivedHitT > 0 ? e.receivedHits + 1 : 1;
    e.receivedHitT = KNOCKDOWN_TIMING.chainWindow; e.receivedHitDir = dir;
    // The continuation grace is still a received-hit reaction. Do not let a
    // victim jump or start a super and then collapse from that old chain.
    if (e.receivedHits >= 3) e.stun = Math.max(e.stun, KNOCKDOWN_TIMING.chainWindow);
  } else {
    e.receivedHits = 0; e.receivedHitT = 0;
  }
  applySecondary(f,e,kind,dir,block);
  const point = contact || CombatGeometry.targetPoint(e,dir);
  emitVfx(block ? 'block' : 'impact', f, point.x, point.y, {
    dir, kind, size: feel.size, power: finisher || kind === 'assist' ? 2 : 1, duration: block ? .22 : finisher ? .34 : .24
  });
  if (!block) audioEvent('hurt', { id: e.id, ownerId: f.id, kind, damage: previousHp - e.hp,
    final: finisher, hp: e.hp, face: e.face, x: e.x, y: e.y });
  if (previousHp > 0 && e.hp <= 0) audioEvent('ko', { id: e.id, winnerId: f.id, kind, x: e.x, y: e.y });
  shake = Math.max(shake, block ? 1.2 : finisher ? 4 : 2);
  freeze = Math.max(freeze, block ? .008 : feel.stop);
  if (e.hp <= 0) beginKnockdown(e, dir, 'ko');
  else if (!block && (kind === 'combo5' || kind === 'heavy' || feel.knockdown))
    beginKnockdown(e, dir, kind === 'heavy' ? 'sweep' : feel.knockdown ? kind : 'finisher');
  return true;
}
function clearPull(f) {
  if (f.pullState) { f.pullState = null; f.vx = 0; }
  const ownerIndex = fighters.indexOf(f);
  for (const target of fighters) {
    if (target.pullState?.ownerIndex === ownerIndex) { target.pullState = null; target.vx = 0; }
  }
}
function applySecondary(f,e,kind,dir,blocked) {
  if(blocked)return;
  const p=CombatGeometry.profile(kind);
  if(p.root)e.rootT=Math.max(e.rootT||0,p.root);
  if(p.pull) {
    e.pullState = { ownerIndex: fighters.indexOf(f), dir, speed: p.pull * CombatGeometry.scale(f) };
    e.vx = -dir * e.pullState.speed;
  }
  if(p.erase){
    e.x=CombatGeometry.clampPullX(f,e,e.x-dir*p.erase*CombatGeometry.scale(f),dir,Stage.width);e.prevX=e.x;
    e.vx=0;
    refreshSupport(e);
    emitVfx('erase',f,e.x,e.y-130*CombatGeometry.scale(e),{kind,power:2,duration:.42});
  }
  if(p.mark&&e.hp>0){e.bombMark={ownerIndex:fighters.indexOf(f),ownerId:f.id,remaining:p.mark.delay,
    count:p.mark.count,index:0,damage:p.mark.damage,interval:p.mark.interval,dir};
    emitVfx('mark',f,e.x,e.y-130*CombatGeometry.scale(e),{kind,power:1,duration:p.mark.delay});}
}
function stepStatuses(dt) {
  for(const target of fighters){
    const mark=target.bombMark;if(!mark)continue;
    const owner=fighters[mark.ownerIndex];
    if(target.hp<=0||!owner||owner.hp<=0){target.bombMark=null;continue;}
    mark.remaining-=dt;
    if(mark.remaining>0)continue;
    const final=mark.index===mark.count-1,kind=final&&mark.count>1?'bombDetonateFinish':'bombDetonate';
    const point=CombatGeometry.targetPoint(target,mark.dir);
    // Marks track the body, but each blast remains blockable and respects a
    // fresh burst/dash immunity. Skipped blasts are consumed, never postponed.
    hit(owner,target,mark.damage,mark.dir,false,final&&mark.count>1,kind,point);
    emitVfx('detonate',owner,point.x,point.y,{kind,power:final?3:2,duration:.35});
    mark.index++;if(mark.index>=mark.count)target.bombMark=null;else mark.remaining+=mark.interval;
  }
}

function updateEffects(dt) {
  vfx.forEach(e => { e.age += dt; });
  vfx = vfx.filter(e => e.age < e.duration);
  shake = Math.max(0, shake - 32 * dt); bannerT = Math.max(0, bannerT - dt);
}
function cancelSuper(reason = null, showNotice = false) {
  const c = cinematic;
  if (!c) return;
  cinematic = null; c.locked = false; c.interactive = false; c.cancelled = reason;
  c.owner.cinematicPose = null; c.target.cinematicPose = null;
  if (c.owner.attack === c.attack) c.owner.attack = null;
  c.owner.standDetached = false; c.owner.standT = 0; c.owner.buffer = null; clearCombo(c.owner);
  if (reason) {
    vfx = vfx.filter(e => !e.cinematic && !(e.ownerId === c.owner.id && e.kind === 'super'));
    if (showNotice) { c.owner.moveNotice = '必杀被打断'; c.owner.moveNoticeT = .85; }
    audioEvent('superCancel', { id: c.owner.id, token: audioCinematicIds.get(c), reason, face: c.dir });
  }
  syncAudio();
}
function beginSuper(owner) {
  const target = fighters.find(f => f !== owner), dir = owner.face;
  const timeline = CombatGeometry.superTimelineFor(owner.id);
  const s=CombatGeometry.scale(owner), standHeight=CombatGeometry.rules.super.standHeight*s;
  const cast = CombatGeometry.castPoint(owner), aim = CombatGeometry.canSuper(owner,target) ? CombatGeometry.targetPoint(target,dir)
    : {x:owner.x+dir*CombatGeometry.rules.super.range*s,y:cast.y};
  cinematic = { owner, target, dir, attack: owner.attack, caught: false, blocked: false,
    captureResolved: false, locked: false, interactive: true, released: false,
    t: 0, timeline, duration: timeline.duration, phase: 'freeze', progress: 0, pulse: 0, hits: 0, attempts: 0, finalHit: false,
    lastImpact: -10, targetX: target.x, targetY: target.y,
    startX:cast.x, endX:aim.x, startY:cast.y, endY:aim.y,
    standX:cast.x, standY:cast.y, impactX:aim.x, impactY:aim.y,
    standHeight, rushRadius:CombatGeometry.rules.super.rushRadius*s, finalRadius:CombatGeometry.rules.super.finalRadius*s,
    focusX: (owner.x + aim.x) / 2,
    focusY: (owner.y + target.y) / 2 - 130, shadowY: Stage.surfaceBelow(owner.x, owner.y).y };
  owner.vx = 0; owner.vy = 0; owner.inv = 0; owner.standDetached = true;
  owner.attack.duration = timeline.duration; owner.attack.fired = true;
  owner.buffer = null; clearCombo(owner); clearPressed();
  freeze = 0; bannerT = 0;
  setSuperPose(cinematic);
  syncAudio();
  audioEvent('superStart', { id: owner.id, kind: 'super', face: dir, x: owner.x, y: owner.y, caught: false });
}
function captureSuper(c) {
  const { owner, target, dir } = c;
  c.captureResolved = true;
  c.caught = CombatGeometry.canSuper(owner, target) && target.inv <= 0 && !blinkInvulnerable(target) && target.hp > 0;
  c.blocked = c.caught && target.guard && target.face === -dir;
  c.locked = c.caught; c.interactive = !c.locked;
  if (!c.caught) return;
  clearPull(owner); clearPull(target);
  cancelHeldProjectiles(target);
  target.attack = null; target.dash = 0; target.vx = 0; target.vy = 0; target.standT = 0; target.standDetached = false;
  target.receivedHits = 0; target.receivedHitT = 0; target.buffer = null; clearCombo(target);
  owner.vx = 0; owner.vy = 0;
  c.targetX = target.x; c.targetY = target.y;
}
function releaseSuper(c) {
  if (c.released) return;
  c.released = true; c.locked = false; c.interactive = true;
  vfx = vfx.filter(e => !e.cinematic);
  c.target.cinematicPose = null;
  if (!c.caught) return;
  c.target.blockStun = false; c.target.stun = 0; c.target.cool = 0; c.target.guard = false; c.target.inv = .10;
  if (c.blocked) c.target.motion.impact = 0;
  c.target.vx = c.dir * (c.blocked ? 45 : c.timeline.push || CombatGeometry.rules.super.push) * CombatGeometry.scale(c.target);
  refreshSupport(c.target);
  if (!c.blocked || c.target.hp <= 0) beginKnockdown(c.target, c.dir, c.target.hp <= 0 ? 'ko' : 'super');
}
function setSuperPose(c) {
  const pose = { timeline: c.timeline, locked: c.locked, interactive: c.interactive,
    t: c.t, phase: c.phase, progress: c.progress, pulse: c.pulse, blocked: c.blocked };
  c.owner.cinematicPose = { ...pose, role: 'attacker' };
  c.target.cinematicPose = c.locked ? { ...pose, role: 'target' } : null;
}
// Scripted contacts are separate from normal invulnerability windows. Each fist
// deals its own damage once; rendering never decides whether a hit has happened.
function superContact(c, final = false) {
  if (!c.caught || !c.locked) return;
  const { owner, target, dir, blocked, timeline } = c;
  const budget = CombatGeometry.superContactBudget(timeline, final ? timeline.rushCount : c.hits, blocked);
  const previousHp = target.hp;
  target.hp = Math.max(0, Math.round(target.hp * 1000 - budget.damageMilli) / 1000);
  c.hits++; c.lastImpact = c.t;
  target.motion.impact = blocked ? .35 : final ? 1 : .65; target.motion.impactDir = dir;
  CombatEnergy.receive(target, previousHp - target.hp, mode === 'training');
  if (!blocked) { owner.chain = c.hits; owner.chainT = .85; }
  const point=CombatGeometry.targetPoint(target,dir);
  c.impactX=point.x; c.impactY=point.y+(final?0:((c.hits%3)-1)*9*CombatGeometry.scale(target));
  emitVfx(blocked ? 'block' : 'impact', owner, c.impactX, c.impactY,
    { dir, kind: 'super', cinematic:true, final, size:final?25:12, power: final ? 3 : 1, duration: final ? .38 : .20 });
  if (!blocked && previousHp > target.hp) audioEvent('hurt', { id: target.id, ownerId: owner.id, kind: 'super',
    damage: previousHp - target.hp, final, hp: target.hp, x: target.x, y: target.y });
  if (previousHp > 0 && target.hp <= 0) audioEvent('ko', { id: target.id, winnerId: owner.id, kind: 'super', x: target.x, y: target.y });
  shake = Math.max(shake, final ? 6 : blocked ? 1 : 2.3);
}
function stepSuper(dt, worldStepped = false) {
  const c = cinematic, timeline = c.timeline, timing = timeline.phases;
  if (c.owner.attack !== c.attack || c.owner.hp <= 0) { cancelSuper('interrupted'); return; }
  const previousTime = c.t;
  c.t = Math.min(c.duration, c.t + dt);
  if (!worldStepped) { simTime += dt; updateEffects(dt); clearPressed(); }
  let phaseStart = 0;
  for (const [phase, duration] of Object.entries(timing)) {
    if (c.t < phaseStart + duration - 1e-9 || phase === 'recover') {
      c.phase = phase; c.progress = Math.max(0, Math.min(1, (c.t - phaseStart) / duration)); break;
    }
    phaseStart += duration;
  }
  const rushStart = timeline.starts.rush;
  if (!c.captureResolved && c.t + 1e-9 >= rushStart) captureSuper(c);
  if (previousTime + 1e-9 < rushStart && c.t + 1e-9 >= rushStart)
    audioEvent('superRush', { id: c.owner.id, kind: 'super', face: c.dir, x: c.owner.x, y: c.owner.y });
  while (c.attempts < timeline.rushCount && c.t + 1e-9 >= (timeline.contacts?.[c.attempts] ?? timeline.firstContact + c.attempts * timeline.beat)) {
    c.attempts++; superContact(c);
  }
  if (!c.finalHit && c.t + 1e-9 >= timeline.finalContact) {
    c.finalHit = true; superContact(c, true);
  }
  c.pulse = Math.max(0, 1 - (c.t - c.lastImpact) / (c.finalHit ? .16 : .065));
  if(!c.captureResolved || c.caught && !c.finalHit) {
    const cast = CombatGeometry.castPoint(c.owner), inRange = c.caught || CombatGeometry.canSuper(c.owner,c.target);
    const aim=inRange ? CombatGeometry.targetPoint(c.target,c.dir)
      : { x:c.owner.x+c.dir*CombatGeometry.rules.super.range*CombatGeometry.scale(c.owner), y:cast.y };
    c.startX=cast.x; c.startY=cast.y; c.endX=aim.x; c.endY=aim.y;
  }
  const approach = Math.max(0, Math.min(1, (c.t - timeline.starts.approach) / timing.approach));
  const ease = 1 - (1 - approach) ** 3;
  c.standX = c.startX + (c.endX - c.startX) * ease;
  c.standY = c.startY + (c.endY - c.startY) * ease;
  if (c.finalHit && c.caught && !c.blocked && !c.released) {
    const push = Math.min(1, Math.max(0, (c.t - timeline.finalContact) / (timing.finish - timeline.finalOffset)));
    c.target.x = Math.max(30, Math.min(Stage.width - 30, c.targetX + c.dir * 38 * CombatGeometry.scale(c.target) * (1 - (1 - push) ** 2)));
  }
  if (c.phase === 'recover') releaseSuper(c);
  if (!worldStepped) fighters.forEach(f => { f.buffer = null; if (c.phase !== 'freeze') { f.motionTime += dt; updateMotion(f, dt); } });
  c.owner.attack.t = c.t;
  c.shadowY = Stage.surfaceBelow(c.standX, c.standY).y;
  setSuperPose(c);
  if (c.t + 1e-9 >= c.duration) {
    releaseSuper(c);
    c.owner.cool = .10; c.owner.chainT = .85;
    cancelSuper(); freeze = 0; fighters.forEach(refreshSupport);
    finishRoundIfNeeded();
  }
  if (!worldStepped) updateCamera(dt);
}
function refreshSupport(f) {
  const previous = f.grounded;
  // A falling foot near a slab has not landed yet; the swept collision must
  // settle vy to zero before support and its landing pulse can be established.
  const support = f.vy === 0 ? Stage.supportAt(f.x, f.y) : null;
  if (support && !(f.dropTimer > 0 && support.id === f.dropId)) {
    f.grounded = true; f.supportId = support.id; f.surfaceY = support.y;
  } else {
    f.grounded = false; f.supportId = null;
    if (previous) f.jumps = Math.max(1, f.jumps);
    f.surfaceY = Stage.surfaceBelow(f.x, f.y).y;
  }
  f.shadowY = f.surfaceY;
}
function stepSignature(f, a, dt) {
  if (a.type === 'starAscend' && !a.launched && a.t + dt + 1e-9 >= CombatGeometry.rules.starAscend.launchAt) {
    a.launched = true; f.vy = CombatGeometry.rules.starAscend.launchSpeed;
    f.grounded = false; f.supportId = null; f.jumps = Math.max(1, f.jumps);
    f.motion.takeoff = 1; f.motion.land = 0;
    emitVfx('land', f, f.x, f.y, { kind: a.type, power: 2, duration: .30, audioType: 'jump' });
  }
  if (a.type === 'timeAmbush' && !a.blinked && a.t + dt + 1e-9 >= CombatGeometry.rules.timeAmbush.blinkAt) {
    const spec = CombatGeometry.rules.timeAmbush, target = fighters.find(e => e !== f), dir = f.face;
    let distance = spec.blinkDistance * CombatGeometry.scale(f);
    if (target && Math.abs(target.y - f.y) <= 65 && (target.x - f.x) * dir > 0)
      distance = Math.min(distance, Math.max(0, (target.x - f.x) * dir - CombatGeometry.spacing(f, target)));
    a.blinkOrigin = { x: f.x, y: f.y };
    f.x = Math.max(30, Math.min(Stage.width - 30, f.x + dir * distance)); f.prevX = f.x;
    a.blinkTarget = { x: f.x, y: f.y }; a.blinked = true;
    emitVfx('blinkOut', f, a.blinkOrigin.x, a.blinkOrigin.y, { kind: a.type, power: 2, size: 28, duration: .32 });
    emitVfx('blinkIn', f, f.x, f.y, { kind: a.type, power: 2, size: 28, duration: .32 });
  }
}
function finishRoundIfNeeded() {
  const [a, b] = fighters;
  if (cinematic?.interactive && (cinematic.owner.hp <= 0 || cinematic.target.hp <= 0 && !cinematic.caught
    || mode !== 'training' && clock <= 0)) cancelSuper('interrupted');
  if (mode === 'training') {
    // Refilling life does not reset the victim's fall, down or rise animation.
    fighters.forEach(f => { if (f.hp <= 0) f.hp = 1000; });
  } else if (!roundDelay && (a.hp <= 0 || b.hp <= 0 || clock <= 0)) {
    const defeated = fighters.filter(f => f.hp <= 0);
    defeated.forEach(f => { if (!f.knockdown) beginKnockdown(f, f.receivedHitDir || -f.face, 'ko'); });
    if (defeated.some(f => f.knockdown.phase !== 'down' || f.knockdown.t + 1e-9 < KNOCKDOWN_TIMING.down)) return;
    const winner = a.hp === b.hp ? -1 : a.hp > b.hp ? 0 : 1;
    if (winner >= 0) {
      wins[winner]++;
      audioEvent('win', { id: fighters[winner].id, loserId: fighters[1 - winner].id, round, match: wins[winner] >= 2 });
    }
    banner = winner < 0 ? 'DRAW · 平局' : fighters[winner].name + ' 拿下本局'; roundDelay = 1.7; bannerT = 1.7; shots = [];
  }
}
function step(dt) {
  camera.prevX = camera.x; camera.prevY = camera.y; camera.prevZoom = camera.zoom;
  fighters.forEach(f => { f.prevX = f.x; f.prevY = f.y; Object.assign(f.prevMotion, f.motion); });
  shots.forEach(p => { p.prevX = p.x; p.prevY = p.y; });
  if (state === 'pause' || state === 'end') { clearPressed(); return; }
  if (state === 'menu') { simTime += dt; updateEffects(dt); clearPressed(); return; }
  // Burst is the one defensive edge accepted before movie lock and hit stop
  // can clear inputs. It never advances a paused timer or moves airborne feet.
  if (intro <= 0 && roundDelay <= 0 && burstInputs()) { updateCamera(dt); return; }
  if (cinematic?.locked) { stepSuper(dt); return; }
  if (intro > 0) { intro = Math.max(0, intro - dt); simTime += dt;
    fighters.forEach(f => { f.motionTime += dt; }); clearPressed(); return; }
  if (roundDelay > 0) {
    updateEffects(dt); roundDelay -= dt; clearPressed();
    if (roundDelay <= 0) {
      if (wins.some(w => w >= 2)) {
        state = 'end'; const winner = wins[0] >= 2 ? 0 : 1;
        showResult('MATCH COMPLETE', fighters[winner].name + ' 获胜', `${wins[0]} : ${wins[1]} · ${mode === 'cpu' ? (winner === 0 ? '漂亮！再挑战一次？' : '调整节奏，再来一场。') : '下一场，交换角色再战。'}`, '再来一场 →');
      } else { round++; newRound(); }
    }
    return;
  }
  // Capture inputs even during hit stop; never drop a press while time is frozen.
  const controls = fighters.map((f, i) => cinematic?.owner === f ? {}
    : i === 1 && mode === 'cpu' ? (freeze > 0 ? {} : cpu(f, fighters[0], dt)) : input(i));
  fighters.forEach((f, i) => queueInput(f, controls[i])); clearPressed();
  if (freeze > 0) { freeze = Math.max(0, freeze - dt); return; }
  simTime += dt; updateEffects(dt);
  if (mode !== 'training') clock = Math.max(0, clock - dt);
  // Both players receive their input and defensive state before ANY hit is resolved.
  fighters.forEach((f, i) => {
    refreshSupport(f);
    for (const key of ['stun', 'inv', 'cool', 'dash', 'comboWindow', 'assistCd', 'chainT', 'standT', 'comboDisplay', 'moveNoticeT', 'receivedHitT', 'burstT', 'rootT']) f[key] = Math.max(0, f[key] - dt);
    if (f.stun <= 0) f.blockStun = false;
    f.dropTimer = Math.max(0, f.dropTimer - dt); if (!f.dropTimer) f.dropId = null;
    if (f.buffer) { f.buffer.life -= dt; if (f.buffer.life < 0) { f.buffer = null; f.attackQueue.length = 0; } }
    f.energy = mode === 'training' ? CombatEnergy.max : CombatEnergy.clamp(f.energy);
    if (mode === 'training') f.assistCd = 0;
    f.motionTime += dt; f.standAge += dt;
    const continuous = controls[i]; action(f, { left: continuous.left, right: continuous.right, up: continuous.up, down: continuous.down, turn: continuous.turn });
  });
  const supers = fighters.filter(f => f.attack?.type === 'super' && !f.attack.fired);
  if (cinematic && supers.length) {
    const previous = cinematic.owner;
    if (cinematic.phase === 'recover') {
      // Recovery is a real opening: an opponent may begin a new super after
      // paying its normal cost, rather than spending it on a stale clash.
      cancelSuper('interrupted');
      previous.cool = Math.max(previous.cool, .10);
      beginSuper(supers[0]); updateCamera(dt); return;
    }
    // A later challenge spends its own energy and cancels both preparations.
    // It cannot overwrite a live cinematic or refund the interrupted caster.
    cancelSuper('clash');
    for (const f of [previous, ...supers]) {
      f.attack = null; f.cool = .30; f.standT = 0; f.buffer = null; clearCombo(f);
      const hand = CombatGeometry.castPoint(f); emitVfx('block', f, hand.x, hand.y, { power:3, duration:.20 });
    }
    freeze = .08; return;
  }
  if (supers.length === 2) {
    // Equal inputs on the same tick cancel symmetrically, without player-order priority.
    supers.forEach(f => { f.attack = null; f.cool = .3; f.standT = 0;
      if (mode !== 'training') CombatEnergy.gain(f, CombatEnergy.perStock);
      const hand=CombatGeometry.castPoint(f); emitVfx('block', f, hand.x, hand.y, { power:3, duration:.20 }); });
    freeze = .08; return;
  }
  if (supers.length === 1) { beginSuper(supers[0]); updateCamera(dt); return; }
  fighters.forEach((f, i) => {
    const r = controls[i], a = f.attack;
    const pullSource = f.pullState && fighters[f.pullState.ownerIndex];
    if (f.pullState && (!pullSource || pullSource.hp <= 0 || f.hp <= 0 || f.stun <= 0 || f.knockdown)) {
      f.pullState = null; f.vx = 0;
    }
    if (f.knockdown) f.vx = f.knockdown.phase === 'fall' ? f.vx * Math.exp(-8 * dt) : 0;
    else if (f.stun > 0) f.vx = f.pullState ? -f.pullState.dir * f.pullState.speed : f.vx * Math.exp(-10 * dt);
    else if (f.dash > 0) f.vx = f.dashDir * MOVEMENT.dashSpeed * Math.min(1, f.dash / dt);
    else if (a) {
      stepSignature(f, a, dt);
      if (CombatGeometry.profile(a.type).dashStart != null) {
        const spec = CombatGeometry.profile(a.type);
        // Integrate the exact overlap, so either direction covers the same
        // distance even when the window starts between fixed simulation ticks.
        const travel = Math.max(0, Math.min(a.t + dt, spec.dashEnd) - Math.max(a.t, spec.dashStart));
        f.vx = dt > 0 ? f.face * spec.dashSpeed * CombatGeometry.scale(f) * travel / dt : 0;
        if (travel > 0 && !a.dashStarted) {
          a.dashStarted = true;
          emitVfx('dash', f, f.x, f.y - 8, { kind: a.type, dir: f.face, duration: .24 });
        }
      } else if (a.type === 'starCounter' || a.type === 'heavenDrive') {
        const spec = CombatGeometry.profile(a.type), target = fighters[1-i];
        const overlap = Math.max(0, Math.min(a.t + dt, spec.chargeEnd) - Math.max(a.t, spec.chargeStart));
        const elapsed=Math.max(0,a.t-spec.chargeStart);
        let distance = a.chargeStopped ? 0 : overlap * (spec.chargeSpeed+(spec.chargeAcceleration||0)*(elapsed+overlap*.5)) * CombatGeometry.scale(f);
        if (overlap > 0 && !a.chargeStarted) {
          a.chargeStarted = true; a.chargeOrigin = { x:f.x, y:f.y };
          emitVfx('dash', f, f.x, f.y-8, { kind:a.type, dir:f.face, duration:.32 });
        }
        if (distance > 0 && !target.knockdown && Math.abs(target.y-f.y)<90 && (target.x-f.x)*f.face>0) {
          const room = Math.max(0, (target.x-f.x)*f.face-CombatGeometry.spacing(f,target));
          if (room <= distance) { distance = room; a.chargeStopped = true; a.chargeStoppedAt = a.t; }
        }
        const wallRoom = f.face > 0 ? Stage.width-30-f.x : f.x-30;
        if (distance > wallRoom) { distance = Math.max(0,wallRoom); a.chargeStopped = true; a.chargeStoppedAt = a.t; }
        f.vx = dt > 0 ? f.face*distance/dt : 0; a.chargeTravel = (a.chargeTravel || 0) + distance;
      } else if (['timeAmbush', 'knifeArray', 'super'].includes(a.type)) f.vx = 0;
      else {
        const lunge = (['melee', 'upper', 'heavy', 'starAscend'].includes(a.type)||CombatGeometry.profile(a.type).melee) && a.t < a.startup + a.active
          && !(a.type === 'melee' && a.combo === COMBO_COUNT && a.hit);
        f.vx = lunge ? f.face * a.lunge * CombatGeometry.scale(f) : f.vx * Math.exp(-24 * dt);
      }
    } else {
      const target = f.guard || f.rootT > 0 ? 0 : ((r.right ? 1 : 0) - (r.left ? 1 : 0)) * f.speed;
      // Reach running speed in about 35ms, decelerate quickly when released.
      f.vx += (target - f.vx) * Math.min(1, dt * (target ? 65 : 85));
    }
    const nextX = Math.max(30, Math.min(Stage.width - 30, f.x + f.vx * dt));
    if (f.pullState) {
      f.x = CombatGeometry.clampPullX(pullSource,f,nextX,f.pullState.dir,Stage.width);
      if (Math.abs(f.x-nextX) > 1e-7 || (f.x-pullSource.x)*f.pullState.dir <= CombatGeometry.spacing(pullSource,f)+1e-7) {
        f.pullState = null; f.vx = 0;
      }
    } else f.x = nextX;
    const oldY = f.y;
    f.vy += MOVEMENT.gravity * dt; f.y += f.vy * dt;
    if (f.y - f.height < Stage.ceiling) { f.y = Stage.ceiling + f.height; f.vy = Math.max(0, f.vy); }
    const landing = Stage.landing(f.x, oldY, f.y, f.vy, f.dropTimer > 0 ? f.dropId : null);
    if (landing) {
      if (!f.grounded && f.vy > 80) {
        f.motion.land = Math.min(1, Math.max(.25, f.vy / 650)); f.motion.takeoff = 0;
        if (f.vy > 200) emitVfx('land', f, f.x, landing.y, { duration: .3 });
      }
      f.y = landing.y; f.vy = 0; f.jumps = 0;
    }
    refreshSupport(f);
    f.runPhase += Math.abs(f.vx) * dt * .06;
    if (a && !(cinematic?.owner === f && a.type === 'super')) a.t += dt;
  });
  const [a, b] = fighters;
  const gap=CombatGeometry.spacing(a,b);
  if (!a.knockdown && !b.knockdown && Math.abs(a.x - b.x) < gap && Math.abs(a.y - b.y) < 65) {
    // Keep the body silhouettes separate while extended hands/feet can reach
    // into the opponent. Move the pair together at a wall to retain that gap.
    const left = a.x <= b.x ? a : b, right = left === a ? b : a;
    left.x = Math.max(30, Math.min(Stage.width - 30 - gap, (a.x + b.x) / 2 - gap*.5)); right.x = left.x + gap;
  }
  const contacts = [];
  fighters.forEach((f, i) => {
    const attack = f.attack, e = fighters[1 - i]; if (!attack) return;
    if (RANGED_TYPES.includes(attack.type) && !attack.fired && attack.t + 1e-9 >= attack.startup) {
      projectile(f, attack.type); attack.fired = true;
    }
    if (attack.type === 'knifeArray' && !attack.fired && attack.t + 1e-9 >= attack.startup) createKnifeArray(f, attack);
    if (['melee', 'upper', 'heavy', 'starAscend', 'starCounter', 'timeAmbush'].includes(attack.type)||CombatGeometry.profile(attack.type).melee) {
      for (let contact = 0; contact < attack.contactTimes.length; contact++) {
        if (attack.contactResolved[contact] || attack.t < attack.contactTimes[contact]) continue;
        const closes = attack.contactTimes[contact] + CombatGeometry.contactDuration(attack,contact);
        if (attack.t >= closes) { attack.contactResolved[contact] = true; attack.contactIndex++; continue; }
        const point=CombatGeometry.meleeContact(f,e,attack,contact);
        if (point) contacts.push({ f, e, attack, contact, dir: f.face, point });
      }
    }
  });
  contacts.forEach(({ f, e, attack, contact, dir, point }) => {
    const final = contact === attack.contactTimes.length - 1;
    const kind = final && CombatGeometry.profile(attack.type).lastKind ? CombatGeometry.profile(attack.type).lastKind : attack.type === 'melee' ? 'combo' + attack.combo
      : final && ['starAscend', 'timeAmbush'].includes(attack.type) ? attack.type + 'Finish' : attack.type;
    const feel = CombatGeometry.profile(kind), outcome = {};
    const connected = hit(f, e, attack.damages[contact], dir, feel.lift < 0, attack.finisher || !!feel.knockdown, kind, point, outcome);
    if (connected) {
      if (attack.type === 'starCounter') { attack.chargeStopped = true; attack.chargeStoppedAt = attack.t; f.vx = 0; }
      if (!outcome.parried) { attack.hit = true; attack.contactsHit[contact] = true; }
      else attack.parried = true;
      attack.contactResolved[contact] = true; attack.contactIndex++;
    }
  });
  fighters.forEach(f => {
    if (f.attack && f.attack.t >= f.attack.duration) {
      if (DIRECTIONAL_TYPES.includes(f.attack.type)) f.standT = 0;
      f.attack = null;
    }
  });
  shots.forEach(p => {
    if (p.held) {
      if (p.owner.attack !== p.sourceAttack || p.owner.hp <= 0 || p.owner.knockdown) { p.t = 0; return; }
      p.hoverAge += dt;
      if (p.sourceAttack.t + 1e-9 < p.releaseAt) return;
      p.held = false; p.prevX = p.x; p.prevY = p.y; p.originX = p.x; p.originY = p.y;
      audioEvent('cast', { id: p.owner.id, kind: p.type, face: Math.sign(p.vx), x: p.x, y: p.y, knifeIndex: p.knifeIndex });
    }
    const enemy=fighters.find(f=>f!==p.owner), spec=CombatGeometry.profile(p.type);
    if(p.homing&&enemy?.hp>0){const delta=enemy.x-p.x;p.vx=Math.sign(delta||p.vx)*spec.speed;}
    const fromX=p.age===0?p.originX:p.x,fromY=p.age===0?p.originY:p.y;
    if(p.grounded)p.vy=(p.vy||0)+MOVEMENT.gravity*dt;
    const travel=Math.min(dt,Math.max(0,p.t));
    p.x += p.vx * travel; p.y += (p.vy || 0) * travel; p.t -= dt; p.age += dt; const e = fighters.find(x => x !== p.owner);
    if(p.grounded){const surface=Stage.landing(p.x,fromY+p.r,p.y+p.r,p.vy);if(surface){p.y=surface.y-p.r;p.vy=0;}}
    const point=CombatGeometry.projectileContact(p,e,fromX,fromY);
    const feel = CombatGeometry.profile(p.type);
    if (point && hit(p.owner, e, p.damage, Math.sign(p.vx), feel.lift < 0, !!feel.knockdown, p.type,point)) p.t = 0;
    if (p.x < -100 || p.x > Stage.width + 100) p.t = 0;
  });
  shots = shots.filter(p => p.t > 0);
  stepStatuses(dt);
  fighters.forEach(f => { refreshSupport(f); updateKnockdown(f, dt); updateMotion(f, dt); });
  if (cinematic) stepSuper(dt, true);
  updateCamera(dt);
  finishRoundIfNeeded();
}
function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(x,y,w,h);}function text(t,x,y,size=16,c='#fff',align='left'){ctx.font=`700 ${size}px "PingFang SC",sans-serif`;ctx.fillStyle=c;ctx.textAlign=align;ctx.fillText(t,x,y);}
function poly(points,c){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=c;ctx.fill();}
function fighterBounds(f) {
  const s = CombatGeometry.scale(f);
  if (f.knockdown) {
    const bounds = typeof JojoActionSprites !== 'undefined' && JojoActionSprites.knockdownBounds?.(f);
    if (bounds) return { left: bounds.left - 10*s, right: bounds.right + 10*s,
      top: bounds.top - 10*s, bottom: bounds.bottom + 10*s };
    return { left: f.x - f.height - 20*s, right: f.x + f.height + 20*s,
      top: f.y - f.height - 20*s, bottom: f.y + 12*s };
  }
  // The generated side kick and finishing cross extend farther than the old
  // standing cutout. Reserve their whole silhouette without zooming per frame.
  const reach = (typeof JojoActionSprites !== 'undefined' && JojoActionSprites.ready(f.id) ? 180 : 82) * s;
  const bounds = { left: f.x - reach, right: f.x + reach, top: f.y - f.height - 20*s, bottom: f.y + 12*s };
  const authored = f.attack && CombatGeometry.profile(f.attack.type);
  if (authored?.style && authored.points) {
    // Fit the same forward/upward route that the new Stand and root effects
    // actually strike along, rather than cropping them to the body height.
    authored.points.forEach((_, index) => {
      const point = CombatGeometry.strike(f, f.attack, index), padding = point.radius + 18*s;
      bounds.left = Math.min(bounds.left, point.x-padding, point.startX-padding);
      bounds.right = Math.max(bounds.right, point.x+padding, point.startX+padding);
      bounds.top = Math.min(bounds.top, point.y-padding, point.startY-padding);
      bounds.bottom = Math.max(bounds.bottom, point.y+padding, point.startY+padding);
    });
  }
  if (f.attack?.type === 'starAscend') bounds.top = Math.min(bounds.top, f.y - f.height * 1.4 - 20*s);
  if (f.attack?.type === 'timeAmbush' && f.attack.blinkOrigin && f.attack.t < CombatGeometry.rules.timeAmbush.blinkAt + .24) {
    const origin = f.attack.blinkOrigin;
    bounds.left = Math.min(bounds.left, origin.x - reach); bounds.right = Math.max(bounds.right, origin.x + reach);
    bounds.top = Math.min(bounds.top, origin.y - f.height - 20*s); bounds.bottom = Math.max(bounds.bottom, origin.y + 12*s);
  }
  return bounds;
}
function viewBounds() {
  const spawns = Stage.spawnPoints || [Stage.width / 2 - 210, Stage.width / 2 + 210];
  const bodies = fighters.length ? fighters : [createFighter(selected, spawns[0], 1), createFighter(selectedOpponent, spawns[1], -1)];
  const boxes = bodies.map(fighterBounds);
  if (cinematic && cinematic.phase !== 'recover') boxes.push(typeof standContactBounds==='function'
    ? standContactBounds(cinematic.owner.id,cinematic.standX,cinematic.standY,cinematic.standHeight,cinematic.dir)
    : {left:cinematic.standX-160,right:cinematic.standX+160,top:cinematic.standY-65,bottom:cinematic.standY+145});
  return { left: Math.min(...boxes.map(b => b.left)), right: Math.max(...boxes.map(b => b.right)),
    top: Math.min(...boxes.map(b => b.top)), bottom: Math.max(...boxes.map(b => b.bottom)) };
}
function fitZoom(bounds) {
  return Math.min((CAMERA_VIEW.right - CAMERA_VIEW.left) / Math.max(1, bounds.right - bounds.left),
    (CAMERA_VIEW.bottom - CAMERA_VIEW.top) / Math.max(1, bounds.bottom - bounds.top));
}
function constrainCamera(x, y, zoom, bounds) {
  // Keep both complete silhouettes outside the HUD and inside the viewport.
  const minX = bounds.right - (CAMERA_VIEW.right - W / 2) / zoom;
  const maxX = bounds.left - (CAMERA_VIEW.left - W / 2) / zoom;
  const minY = bounds.bottom - (CAMERA_VIEW.bottom - CAMERA_VIEW.centerY) / zoom;
  const maxY = bounds.top - (CAMERA_VIEW.top - CAMERA_VIEW.centerY) / zoom;
  return { x: Math.max(minX, Math.min(maxX, x)), y: Math.max(minY, Math.min(maxY, y)) };
}
function targetCamera() {
  const bounds = viewBounds();
  const enter = cinematic ? Math.min(1, cinematic.t / cinematic.timeline.starts.rush) : 0;
  const exit = cinematic?.phase === 'recover' ? 1 - cinematic.progress : 1;
  // The fixed close-view cap preserves the smaller bodies on screen.
  const maxZoom = 1.16 * (1 + .055 * enter * exit);
  // The enlarged arena can span more than the old .28 minimum allowed.
  // Fit the complete silhouettes even at opposite corners and maximum height.
  const zoom = Math.min(maxZoom, fitZoom(bounds));
  const halfWidth = W / (2 * zoom);
  let x = (bounds.left + bounds.right) / 2;
  x = halfWidth * 2 >= Stage.width ? Stage.width / 2 : Math.max(halfWidth, Math.min(Stage.width - halfWidth, x));
  const y = (bounds.top + bounds.bottom) / 2;
  return { ...constrainCamera(x, y, zoom, bounds), zoom };
}
function updateCamera(dt, snap = false) {
  const target = targetCamera(), bounds = viewBounds();
  const follow = snap ? 1 : 1 - Math.exp(-6 * dt);
  const zoomEase = snap ? 1 : 1 - Math.exp(-(target.zoom < camera.zoom ? 8 : 3.5) * dt);
  // Zoom out fast enough to keep new separation visible, ease in as they close.
  camera.zoom = Math.min(fitZoom(bounds), camera.zoom + (target.zoom - camera.zoom) * zoomEase);
  const center = constrainCamera(camera.x + (target.x - camera.x) * follow,
    camera.y + (target.y - camera.y) * follow, camera.zoom, bounds);
  camera.x = center.x; camera.y = center.y;
  if (snap) { camera.prevX = camera.x; camera.prevY = camera.y; camera.prevZoom = camera.zoom; }
}
function hud() {
  fighters.forEach((f,i) => {
    const x=i?W-460:40, align=i?'right':'left', edge=i?1060:40;
    text((i?'2P / ':'1P / ')+f.name,edge,45,19,'#f4ede6',align);
    rect(x,59,420,18,'#14212bcc');const width=420*f.hp/1000;
    rect(i?x+420-width:x,59,width,18,f.color);rect(x,59,420,2,'#ffffff44');
    text(Math.ceil(f.hp)+' / 1000',edge,93,10,'#d6dce0',align);
    if(typeof EnergyHUD!=='undefined') EnergyHUD.draw(ctx,f,{x:i?W-250:40,y:108,width:210,mirrored:!!i});
    else text('气 '+Math.floor(f.energy)+' / '+CombatEnergy.max,edge,126,12,'#8bdfff',align);
    const assistX=i?830:270;
    rect(i?632:262,104,198,38,'#0b1723ba');
    text('援助 / 爆气',assistX,116,10,'#94aabc',align);
    text(f.assistCd>0?Math.ceil(f.assistCd)+' 秒冷却':f.energy>=50?'爆气可用 · 50 气':'爆气需要 50 气',assistX,134,10,f.assistCd>0?'#94aabc':f.energy>=50?'#bde8d6':'#b9c7d5',align);
    for(let j=0;j<2;j++){ctx.beginPath();ctx.arc(i?1052-j*17:48+j*17,157,4,0,7);ctx.fillStyle=wins[i]>j?'#ffd187':'#ffffff33';ctx.fill();}
    if(f.chain>1&&f.chainT>0)text(f.chain+' HITS',i?1040:60,232,30,f.color,i?'right':'left');
  });
  text(mode==='training'?'∞':String(Math.ceil(clock)).padStart(2,'0'),550,74,42,'#fff0d3','center');
  text(mode==='training'?'FREE PRACTICE':'ROUND '+round,550,96,10,'#d2d8d7','center');
}
function comboHud() {
  fighters.forEach((f, side) => {
    if (!cinematic && f.moveNoticeT > 0 && f.moveNotice && f.comboDisplay <= 0) {
      ctx.save(); ctx.globalAlpha = Math.min(1, f.moveNoticeT / .16);
      text(f.moveNotice, side ? 1014 : 86, 166, 12, f.color, side ? 'right' : 'left'); ctx.restore();
      return;
    }
    if (f.comboDisplay <= 0 || !f.comboLabel || cinematic) return;
    ctx.save(); ctx.globalAlpha = Math.min(1, f.comboDisplay / .18);
    const x = side ? 1014 : 86, align = side ? 'right' : 'left';
    text(String(f.combo).padStart(2, '0') + ' / ' + String(COMBO_COUNT).padStart(2, '0') + ' · ' + f.comboLabel, x, 156, 12, f.color, align);
    const startX = side ? 652 : 335;
    for (let index = 0; index < COMBO_COUNT; index++) {
      const order = side ? COMBO_COUNT - 1 - index : index;
      rect(startX + index * 18, 148, 13, 6, order < f.combo ? f.color : '#ffffff20');
    }
    const queued = (plainAttack(f.buffer) ? 1 : 0) + f.attackQueue.length;
    if (queued) text('已接住 ' + queued + ' 次追按', x, 172, 9, '#ddd2df', align);
    ctx.restore();
  });
}
function renderPosition(entity, alpha) {
  return { x: entity.prevX + (entity.x - entity.prevX) * alpha,
    y: entity.prevY + (entity.y - entity.prevY) * alpha };
}
function renderMotion(f, alpha) {
  const motion = {};
  for (const key of Object.keys(f.motion)) motion[key] = key === 'impactDir' ? f.motion[key]
    : f.prevMotion[key] + (f.motion[key] - f.prevMotion[key]) * alpha;
  return motion;
}
function draw(t, alpha = 1) {
  ctx.save(); ctx.clearRect(0, 0, W, H);
  const view = { x: camera.prevX + (camera.x - camera.prevX) * alpha,
    y: camera.prevY + (camera.y - camera.prevY) * alpha,
    zoom: camera.prevZoom + (camera.zoom - camera.prevZoom) * alpha };
  Stage.drawBackground(ctx, view, W, H, t);
  if (cinematic && ['rush','finish'].includes(cinematic.phase)) rect(0, 0, W, H, '#0c081d55');
  ctx.save();
  if (shake > 0) ctx.translate(Math.sin(t * 173) * shake, Math.cos(t * 137) * shake * .5);
  ctx.translate(W / 2, CAMERA_VIEW.centerY); ctx.scale(view.zoom, view.zoom); ctx.translate(-view.x, -view.y);
  Stage.drawWorld(ctx, view, W, H, t);
  vfx.filter(e => ['land', 'dash', 'assist'].includes(e.type)).forEach(e => BattleVFX.drawEvent(ctx, e));
  const spawns = Stage.spawnPoints || [Stage.width / 2 - 210, Stage.width / 2 + 210];
  const list = fighters.length ? fighters : [createFighter(selected, spawns[0], 1), createFighter(selectedOpponent, spawns[1], -1)];
  // The attacking silhouette stays in front of the receiver, so a near-side
  // arm or kicking foot is not hidden simply because it belongs to Player 1.
  const drawOrder = [...list].sort((a, b) => Number(!!a.attack) - Number(!!b.attack));
  drawOrder.forEach(f => {
    const position = renderPosition(f, alpha);
    drawCombatant(ctx, { ...f, ...position, motion: renderMotion(f, alpha), motionTime: state === 'menu' ? t : f.motionTime }, t);
  });
  shots.forEach(p => {
    const position = renderPosition(p, alpha);
    if (p.type === 'assist') drawStandAtContact(ctx,p.owner.id,position.x,position.y,
      CombatGeometry.rules.assist.height*CombatGeometry.scale(p.owner),p.vx<0?-1:1,.9);
    BattleVFX.drawProjectile(ctx, { ...p, ...position }, t);
  });
  if (cinematic && typeof SuperVFX !== 'undefined') SuperVFX.drawWorld(ctx, cinematic, W, H);
  vfx.filter(e => !['land', 'dash', 'assist'].includes(e.type)).forEach(e => BattleVFX.drawEvent(ctx, e));
  ctx.restore();
  ctx.globalAlpha = 1;
  if (fighters.length && state !== 'menu') { hud(); comboHud(); }
  if (cinematic && typeof SuperVFX !== 'undefined') SuperVFX.drawOverlay(ctx, cinematic, W, H);
  if (intro > 0 && state === 'fight') text(intro > .5 ? 'ROUND ' + round : 'FIGHT', 550, 288, intro > .5 ? 46 : 76, '#fff0d1', 'center');
  if (bannerT > 0) {
    if (roundDelay > 0) { rect(290, 180, 520, 52, '#101923bb'); text(banner, 550, 214, 24, '#ffcf91', 'center'); }
    else {
      const fade = Math.min(1, bannerT / .12, (.65 - bannerT) / .09);
      ctx.save(); ctx.globalAlpha = Math.max(0, fade);
      const g = ctx.createLinearGradient(365, 0, 735, 0);
      g.addColorStop(0, '#101a2700'); g.addColorStop(.25, '#102337e8'); g.addColorStop(.75, '#102337e8'); g.addColorStop(1, '#101a2700');
      rect(365, 167, 370, 60, g); text('奥义  /  SECRET TECHNIQUE', 550, 183, 9, '#96dce8', 'center');
      text(banner, 550, 213, 22, '#e7fdff', 'center'); ctx.restore();
    }
  }
  ctx.restore();
}
function advanceFrame(ms) {
  if (last === null) last = ms;
  // Bounded catch-up: retain up to 100ms through a brief stall without a spiral.
  acc += Math.max(0, Math.min((ms - last) / 1000, .1)); last = ms;
  while (acc + 1e-10 >= FIXED_DT) { step(FIXED_DT); acc = Math.max(0, acc - FIXED_DT); }
  return Math.min(1, acc / FIXED_DT);
}
function loop(ms) {
  const alpha = advanceFrame(ms);
  syncAudio();
  draw(simTime, alpha);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Do not permit a match with missing or substituted artwork.
if (typeof Image !== 'undefined' && typeof CharacterArt !== 'undefined') {
  Promise.all([CharacterArt.load(), typeof JojoActionSprites !== 'undefined'
    ? JojoActionSprites.load(typeof JOJO_SPRITE_CONFIG !== 'undefined' ? JOJO_SPRITE_CONFIG : {}) : Promise.resolve([])]).then(([, sprites]) => {
    for (const id of Object.keys(roster)) {
      const portrait = $('#' + id + '-portrait');
      if (portrait) {
        const pctx = portrait.getContext('2d'); pctx.clearRect(0, 0, 320, 320);
        const generated = typeof JojoActionSprites !== 'undefined' && JojoActionSprites.drawPortrait(pctx, id, 160, 314, 300);
        if (!generated) {
          const geometry = CharacterArt.geometry(id, 300);
          CharacterArt.paint(pctx, id, 160 - geometry.dx - geometry.dw / 2, 314, 300);
        }
      }
    }
    const missing = Object.keys(roster).filter(id => !JojoActionSprites.status(id).fullReady || !JojoActionSprites.status(id).knockdownReady || !CharacterArt.status(id).ready || !CharacterArt.status(StandContacts[id]?.art).ready);
    $('#start').disabled = missing.length > 0;
    $('#asset-status').textContent = missing.length ? '素材加载失败：' + missing.map(id => roster[id].name).join('、') + ' · 请刷新重试'
      : '六位角色动作已就绪 · K 跳跃，L 冲刺，J 连招';
  }).catch(() => {
    $('#start').disabled = true;
    $('#asset-status').textContent = '角色原画加载失败，请刷新重试';
  });
}
