'use strict';

// Production cues carry the caster's frozen clock, including on the target.
// The fallback only serves isolated artwork previews without game geometry.
const fighterCinematicFallback = Object.freeze({
  phases: Object.freeze({ freeze: 1.75, approach: .22, rush: 1.28, finish: .30, recover: .30 }),
  starts: Object.freeze({ freeze: 0, approach: 1.75, rush: 1.97, finish: 3.25, recover: 3.55 }),
  duration: 3.85, rushCount: 16, beat: .08, firstContact: 2.01, finalContact: 3.33, finalOffset: .08
});
function fighterCinematicTimeline(id, cue) {
  const geometry = typeof CombatGeometry !== 'undefined' ? CombatGeometry : null;
  return cue?.timeline || geometry?.superTimelineFor?.(id) || geometry?.superTimeline || fighterCinematicFallback;
}
// Authored specials may accelerate, pause, or use a handful of heavy contacts.
// Render pulses peak on those contact times, never on an invented regular beat.
function fighterCinematicBeat(timeline, time) {
  const contacts = timeline.contacts;
  if (!Array.isArray(contacts) || !contacts.length) {
    const cycle = (time - timeline.firstContact) / timeline.beat * Math.PI + Math.PI / 2;
    return { cycle, left: Math.max(0, Math.sin(cycle)), right: Math.max(0, -Math.sin(cycle)),
      pulse: Math.abs(Math.sin(cycle)), index: Math.max(0, Math.round((time - timeline.firstContact) / timeline.beat)) };
  }
  let index = 0;
  for (let i = 1; i < contacts.length; i++) if (Math.abs(time - contacts[i]) < Math.abs(time - contacts[index])) index = i;
  const at = contacts[index], previous = contacts[index - 1] ?? timeline.starts.rush;
  const next = contacts[index + 1] ?? timeline.starts.finish;
  const span = Math.max(.012, Math.min(time < at ? at - previous : next - at, .14) * .48);
  const u = Math.max(0, Math.min(1, 1 - Math.abs(time - at) / span));
  const pulse = u * u * (3 - 2 * u);
  return { cycle: index * Math.PI + Math.PI / 2, left: index % 2 ? 0 : pulse,
    right: index % 2 ? pulse : 0, pulse, index };
}

const fighterExpansionArt = typeof JOJO_EXPANSION_ART !== 'undefined' && JOJO_EXPANSION_ART || {};
const fighterAuraColors = Object.freeze({ jotaro: '#a68ce6', dio: '#e4ce53', giorno: '#9bf498',
  kira: '#cc97e5', pucci: '#daddeb', okuyasu: '#6c9eff' });

function fighterVisibleCinema(f) {
  const cue = f.cinematicPose;
  return cue?.role === 'target' && (cue.locked === false || !['rush', 'finish'].includes(cue.phase)) ? null : cue;
}
function fighterBurstView(f) {
  return f.burstT > 0 ? { ...f, cinematicPose: null, knockdown: null, attack: null,
    guard: false, blockStun: false, stun: 0, dash: 0, standT: 0, standDetached: false,
    motion: f.motion ? { ...f.motion, guard: 0, impact: 0, dash: 0 } : f.motion } : f;
}
function fighterDashTiming() {
  const movement = typeof MOVEMENT !== 'undefined' ? MOVEMENT : null;
  const duration = movement?.dashDuration || .22;
  return { duration, speed: movement?.dashSpeed || 1000, lead: duration * .20, brake: duration * .20 };
}

// Original published artwork stays byte-for-byte on disk. The standing Jotaro
// JPEG only receives a cached, connected exterior alpha mask in the renderer.
function connectedExteriorMask(imageData, backgroundSeeds = []) {
  const { width, height, data } = imageData, visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height); let read = 0, write = 0;
  function enqueue(index) {
    if (visited[index]) return;
    const i = index * 4, lo = Math.min(data[i], data[i + 1], data[i + 2]), hi = Math.max(data[i], data[i + 1], data[i + 2]);
    if (data[i + 3] !== 0 && (lo < 241 || hi - lo > 18)) return;
    visited[index] = 1; queue[write++] = index;
  }
  for (let x = 0; x < width; x++) { enqueue(x); enqueue((height - 1) * width + x); }
  for (let y = 1; y < height - 1; y++) { enqueue(y * width); enqueue(y * width + width - 1); }
  // A published figure may enclose a genuine background gap with its arm.
  // Such gaps are explicitly seeded; enclosed white costume panels are not.
  for (const [x, y] of backgroundSeeds) if (x >= 0 && x < width && y >= 0 && y < height) enqueue(y * width + x);
  while (read < write) {
    const i = queue[read++], x = i % width; data[i * 4 + 3] = 0;
    if (x > 0) enqueue(i - 1); if (x < width - 1) enqueue(i + 1);
    if (i >= width) enqueue(i - width); if (i < width * (height - 1)) enqueue(i + width);
  }
  let left = width, top = height, right = 0, bottom = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3]) {
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
  }
  return right ? [left, top, right - left, bottom - top] : [0, 0, 0, 0];
}

const CharacterArt = (() => {
  const specs = Object.freeze({
    ...Object.fromEntries(Object.entries(fighterExpansionArt.specs || {}).filter(([, spec]) =>
      spec && typeof spec.src === 'string' && Array.isArray(spec.rect) && spec.rect.length === 4
      && spec.rect.every(Number.isFinite) && spec.rect[2] > 0 && spec.rect[3] > 0 && Number.isFinite(spec.anchorX))
      .map(([id, spec]) => [id, Object.freeze({ ...spec, rect: Object.freeze([...spec.rect]) })])),
    jotaro: Object.freeze({ src: 'assets/jojo/jotaro-standing.jpg', rect: Object.freeze([213, 68, 247, 756]), anchorX: 331, nativeFace: -1 }),
    dio: Object.freeze({ src: 'assets/jojo/dio.png', rect: Object.freeze([139, 118, 516, 1313]), anchorX: 400, nativeFace: 1 }),
    'star-platinum': Object.freeze({ src: 'assets/jojo/star-platinum.png', rect: Object.freeze([468, 189, 598, 760]), anchorX: 767 }),
    'the-world': Object.freeze({ src: 'assets/jojo/the-world.png', rect: Object.freeze([534, 0, 525, 712]), anchorX: 797 })
  });
  const images = new Map(), rigs = new Map(), errors = new Map();
  const bodyScale = .17;
  let ready = false, loading = null;
  function geometry(id, height) {
    const spec = specs[id];
    if (!spec) return null;
    const [sx, sy, sw, sh] = spec.rect;
    const scale = height / sh;
    return { sx, sy, sw, sh, dx: -(spec.anchorX - sx) * scale, dy: -height, dw: sw * scale, dh: height, scale };
  }
  function paint(ctx, id, x, y, height, alpha = 1) {
    const img = images.get(id);
    if (!img || !ready) return false;
    const g = geometry(id, height);
    ctx.save();
    ctx.globalAlpha *= Math.max(0, Math.min(1, alpha));
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    // No mirroring: preserve asymmetric costume details such as Jotaro's chain.
    // Selection portraits and cinematic cards retain the exact source pose.
    ctx.drawImage(img, g.sx, g.sy, g.sw, g.sh, x + g.dx, y + g.dy, g.dw, g.dh);
    ctx.restore();
    return true;
  }
  function load() {
    if (loading) return loading;
    loading = (async () => {
    await Promise.allSettled(Object.entries(specs).map(async ([id, spec]) => {
      try {
      const img = new Image(); img.src = spec.src;
      await img.decode();
      let source = img;
      const canKey = typeof document !== 'undefined' && typeof document.createElement === 'function';
      const magenta = spec.chromaKey === 'magenta';
      if ((id === 'jotaro' || magenta) && canKey) {
        source = document.createElement('canvas'); source.width = img.width; source.height = img.height;
        const ctx = source.getContext('2d'); ctx.drawImage(img, 0, 0);
        const pixels = ctx.getImageData(0, 0, source.width, source.height);
        if (magenta) {
          if (typeof JojoActionSprites !== 'undefined' && typeof JojoActionSprites.keyMagenta === 'function') JojoActionSprites.keyMagenta(pixels);
          else for (let i = 0; i < pixels.data.length; i += 4) {
            const data = pixels.data;
            if (Math.min(data[i], data[i + 2]) > 224 && data[i + 1] < 40
              && Math.min(data[i], data[i + 2]) - data[i + 1] > 195) data[i + 3] = 0;
          }
        } else connectedExteriorMask(pixels, [[401, 275]]);
        ctx.putImageData(pixels, 0, 0);
      }
      images.set(id, source);
      } catch (error) { errors.set(id, String(error?.message || error)); }
    }));
    // Build masks once, at source resolution. The official PNGs are never edited.
    // Headless rules tests do not need a canvas, and keep the same loading contract.
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      for (const [id, img] of images) if (JojoRig.supports(id)) rigs.set(id, JojoRig.prepare(img, specs[id], id));
    }
    ready = true;
    })();
    return loading;
  }
  function articulate(ctx, id, x, y, height, pose, alpha = 1) {
    const rig = rigs.get(id);
    if (!ready) return;
    if (!rig) { paint(ctx, id, x, y, height, alpha); return; }
    JojoRig.paint(ctx, rig, x, y, height, pose, alpha);
  }
  const status = id => ({ ready: ready && images.has(id), rigged: rigs.has(id), error: errors.get(id) || null });
  return Object.freeze({ specs, geometry, paint, articulate, load, status, bodyScale, get ready() { return ready; } });
})();

// Articulated cutout animation: all skin, ink and costume pixels come from the
// four untouched official images. Every transform is rigid; no limb is stretched.
const JojoRig = (() => {
  const configs = {
    jotaro: {
      hip: [313, 399], legCap: 24, kneeOverlap: 12,
      knees: [[302, 568], [380, 580]], feet: [['shinL', [232, 796]], ['shinR', [419, 817]]],
      parts: [
        { name: 'coatL', front: true, pivot: [245, 440], cap: 12, points: [[228,430],[251,430],[257,479],[262,521],[266,548],[247,556],[248,589],[207,589]] },
        { name: 'coatR', front: true, pivot: [375, 378], cap: 18, points: [[369,315],[393,325],[404,392],[406,449],[422,475],[447,556],[449,574],[376,591],[371,523],[364,459],[359,381]] },
        { name: 'legL', pivot: [285, 418], cap: 24, points: [[257,396],[313,403],[320,448],[326,482],[330,520],[328,544],[334,591],[340,650],[337,718],[333,857],[0,857],[0,589],[267,580],[266,548],[255,485],[253,438]] },
        { name: 'legR', pivot: [349, 420], cap: 24, points: [[313,403],[365,403],[373,483],[374,535],[367,550],[376,583],[610,588],[610,857],[333,857],[337,718],[340,650],[334,591],[328,544],[330,520],[326,482],[320,448]] },
        { name: 'head', pivot: [326, 167], cap: 13, points: [[287,62],[370,62],[370,132],[355,171],[306,176],[293,154],[286,133]] },
        { name: 'armL', pivot: [256, 186], cap: 17, points: [[0,150],[269,151],[279,163],[278,198],[265,239],[264,271],[257,295],[0,295]] },
        { name: 'foreL', parent: 'armL', pivot: [247, 286], cap: 14, points: [[0,277],[257,274],[263,293],[257,318],[252,351],[250,393],[248,432],[231,435],[222,418],[222,397],[0,394]] },
        { name: 'armR', pivot: [418, 187], cap: 18, points: [[391,156],[610,141],[610,297],[422,297],[412,271],[397,247],[390,224]] },
        { name: 'foreR', parent: 'armR', pivot: [429, 291], cap: 14, points: [[416,282],[610,281],[610,452],[412,452],[411,430],[410,409],[416,390],[413,363],[416,324]] }
      ]
    },
    dio: {
      hip: [364, 699], knees: [[313, 948], [383, 948]], feet: [['shinL', [288, 1355]], ['shinR', [518, 1424]]],
      parts: [
        { name: 'legL', pivot: [300, 718], cap: 30, points: [[0,710],[334,710],[356,744],[350,813],[342,869],[337,895],[349,959],[373,1050],[399,1143],[415,1230],[433,1305],[430,1502],[0,1502]] },
        { name: 'legR', pivot: [411, 716], cap: 32, points: [[334,710],[551,710],[551,823],[1400,823],[1400,1502],[430,1502],[433,1305],[415,1230],[399,1143],[373,1050],[349,959],[337,895],[342,869],[350,813],[356,744]] },
        { name: 'head', pivot: [413, 274], cap: 27, points: [[335,108],[472,108],[477,182],[470,220],[454,274],[370,282],[344,227]] },
        { name: 'armL', pivot: [262, 342], cap: 30, points: [[0,290],[268,290],[304,309],[291,372],[274,420],[273,462],[243,505],[237,541],[155,561],[0,548]] },
        { name: 'foreL', parent: 'armL', pivot: [199, 536], cap: 29, points: [[0,502],[222,498],[248,540],[245,565],[260,575],[281,579],[290,614],[280,655],[239,659],[225,625],[0,622]] },
        { name: 'armR', pivot: [561, 339], cap: 33, points: [[519,280],[1400,240],[1400,528],[573,551],[552,544],[544,502],[520,453],[507,407],[508,342]] },
        { name: 'foreR', parent: 'armR', pivot: [599, 548], cap: 29, points: [[550,524],[1400,514],[1400,820],[550,820],[550,715],[556,661],[547,600]] }
      ]
    },
    'star-platinum': {
      hip: [757, 509], feet: [],
      parts: [
        { name: 'fistL', pivot: [601, 556], cap: 39, points: [[558,561],[640,534],[721,565],[753,618],[874,611],[978,606],[968,671],[1029,707],[1040,751],[1008,770],[1006,828],[972,885],[937,928],[891,951],[802,943],[733,896],[691,823],[617,811],[514,752],[488,711],[505,655]] },
        { name: 'head', pivot: [868, 508], cap: 30, points: [[808,208],[928,179],[1039,188],[1079,268],[1076,402],[1043,480],[986,489],[927,511],[900,540],[854,521],[807,449],[815,348]] }
      ]
    },
    'the-world': {
      hip: [784, 368], feet: [],
      parts: [
        { name: 'fistL', pivot: [615, 490], cap: 30, points: [[575,472],[660,466],[713,482],[738,530],[734,573],[712,604],[672,630],[614,632],[565,609],[549,569],[552,513]] },
        { name: 'fistR', pivot: [899, 553], cap: 32, points: [[880,541],[951,544],[999,541],[1059,554],[1067,714],[925,726],[863,702],[821,676],[811,627],[837,586]] }
      ]
    }
  };
  const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
  function path(ctx, points) {
    ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
  }
  function surface(w, h) {
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; return canvas;
  }
  function cut(img, points) {
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const x = Math.max(0, Math.floor(Math.min(...xs)) - 2), y = Math.max(0, Math.floor(Math.min(...ys)) - 2);
    const w = Math.min(img.width - x, Math.ceil(Math.max(...xs)) - x + 2), h = Math.min(img.height - y, Math.ceil(Math.max(...ys)) - y + 2);
    const canvas = surface(w, h), ctx = canvas.getContext('2d');
    ctx.save(); ctx.translate(-x, -y); path(ctx, points); ctx.clip(); ctx.drawImage(img, 0, 0); ctx.restore();
    return { canvas, x, y };
  }
  function prepare(img, spec, id) {
    const config = configs[id];
    if (!config) return null;
    const [sx, sy, sw, sh] = spec.rect;
    const canvas = surface(sw, sh), ctx = canvas.getContext('2d');
    ctx.translate(-sx, -sy); ctx.drawImage(img, 0, 0);
    // Inverse mask means the moving limb is absent from the resting body.
    ctx.globalCompositeOperation = 'destination-out';
    for (const part of config.parts) { path(ctx, part.points); ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over';
    // Source-pixel joint caps sit beneath the moving part, covering small turns
    // without generated/inpainted tissue or an unmoving duplicate whole limb.
    for (const part of config.parts) {
      if (part.parent) continue;
      const cap = part.name.startsWith('leg') ? (config.legCap || 51) : part.cap;
      ctx.save(); ctx.beginPath(); ctx.arc(...part.pivot, cap, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(img, 0, 0); ctx.restore();
    }
    const parts = [];
    for (const part of config.parts) {
      const pixels = cut(img, part.points);
      if (part.name.startsWith('leg') && config.knees) {
        const pivot = config.knees[part.name === 'legL' ? 0 : 1], shin = cut(img, part.points), overlap = config.kneeOverlap || 24;
        // The knee overlap uses the existing trouser/kneepad texture. Thigh and
        // shin remain their original lengths while the knee can actually flex.
        pixels.canvas.getContext('2d').clearRect(0, pivot[1] + overlap - pixels.y, pixels.canvas.width, pixels.canvas.height);
        shin.canvas.getContext('2d').clearRect(0, 0, shin.canvas.width, pivot[1] - overlap - shin.y);
        parts.push({ ...part, ...pixels });
        parts.push({ name: part.name === 'legL' ? 'shinL' : 'shinR', parent: part.name, pivot, ...shin });
      } else parts.push({ ...part, ...pixels });
    }
    return { spec, config, body: { canvas, x: sx, y: sy }, parts };
  }
  function multiply(a, b) {
    return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
  }
  function joint(pivot, angle = 0, x = 0, y = 0) {
    const c = Math.cos(angle), s = Math.sin(angle), [px, py] = pivot;
    return [c, s, -s, c, px - c * px + s * py + x, py - s * px - c * py + y];
  }
  function point(m, p) { return [m[0]*p[0]+m[2]*p[1]+m[4], m[1]*p[0]+m[3]*p[1]+m[5]]; }
  function matrices(rig, pose) {
    const base = joint(rig.config.hip, pose.lean, pose.x, pose.y), all = { body: base };
    for (const part of rig.parts) {
      const p = pose[part.name] || {};
      all[part.name] = multiply(part.parent ? all[part.parent] : base, joint(part.pivot, p.angle, p.x, p.y));
    }
    return all;
  }
  function grounding(rig, pose, all) {
    if (!pose.grounded || !rig.config.feet.length) return 0;
    const feet = pose.supportFoot ? rig.config.feet.filter(([name]) => name === pose.supportFoot) : rig.config.feet;
    return Math.max(...feet.map(([name, p]) => point(all[name], p)[1])) - (rig.spec.rect[1] + rig.spec.rect[3] - 7);
  }
  function paint(ctx, rig, x, y, height, pose = {}, opacity = 1) {
    const scale = height / rig.spec.rect[3], all = matrices(rig, pose), bottom = rig.spec.rect[1] + rig.spec.rect[3];
    const floorCorrection = grounding(rig, pose, all);
    ctx.save(); ctx.globalAlpha *= clamp(opacity, 0, 1);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.translate(x - rig.spec.anchorX * scale, y - bottom * scale - floorCorrection * scale); ctx.scale(scale, scale);
    function piece(part, m, alpha = 1) {
      ctx.save(); ctx.globalAlpha *= alpha; ctx.transform(...m); ctx.drawImage(part.canvas, part.x, part.y); ctx.restore();
    }
    const back = ['coatL', 'coatR', 'legL', 'shinL', 'legR', 'shinR'];
    for (const part of rig.parts) if (back.includes(part.name) && !part.front) piece(part, all[part.name]);
    piece(rig.body, all.body);
    for (const part of rig.parts) if (!back.includes(part.name) || part.front) {
      // Fist echoes are the very same original fist pixels at earlier positions.
      if (pose.echo && part.name.startsWith('fist')) {
        for (let i = 3; i > 0; i--) {
          const echo = [...all[part.name]]; echo[4] -= pose.echo * i * 34; echo[5] += (part.name === 'fistR' ? -1 : 1) * i * 8;
          piece(part, echo, .055 * (4 - i));
        }
      }
      piece(part, all[part.name]);
    }
    ctx.restore();
  }
  const poseParts = ['head', 'armL', 'armR', 'foreL', 'foreR', 'legL', 'legR', 'shinL', 'shinR', 'coatL', 'coatR'];
  const smooth = value => { const x = clamp(value, 0, 1); return x * x * (3 - 2 * x); };
  const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
  function mixPose(pose, target, weight) {
    const w = clamp(finite(weight), 0, 1);
    for (const key of ['lean', 'x', 'y']) if (Number.isFinite(target[key])) pose[key] += (target[key] - pose[key]) * w;
    for (const name of poseParts) if (target[name]) for (const key of ['angle', 'x', 'y']) {
      if (Number.isFinite(target[name][key])) pose[name][key] += (target[name][key] - pose[name][key]) * w;
    }
    return pose;
  }
  function addPose(pose, target, weight = 1) {
    const w = clamp(finite(weight), 0, 1);
    for (const key of ['lean', 'x', 'y']) if (Number.isFinite(target[key])) pose[key] += target[key] * w;
    for (const name of poseParts) if (target[name]) for (const key of ['angle', 'x', 'y']) {
      if (Number.isFinite(target[name][key])) pose[name][key] += target[name][key] * w;
    }
    return pose;
  }
  function attackBeat(attack) {
    if (!attack) return { wind: 0, strike: 0, settle: 0, presence: 0, pulses: [], pulseIndex: 0, phase: 'idle' };
    const startup = Math.max(.025, finite(attack.startup, .06)), active = Math.max(.025, finite(attack.active, .08));
    const duration = Math.max(startup + active + .025, finite(attack.duration, .3));
    const t = clamp(finite(attack.t), 0, duration), recovery = duration - startup - active;
    const end = startup + active;
    const contacts = Array.isArray(attack.contactTimes) && attack.contactTimes.length
      ? attack.contactTimes.filter(value => Number.isFinite(value) && value >= 0 && value < end).slice(0, 4) : [startup];
    if (!contacts.length) contacts.push(startup);
    // Every real contact owns a separate extension. In a double strike, the
    // first fist retracts before the second starts; the whole burst retracts
    // before the cancel window. No render frame can invent another hit.
    const wind = t < startup ? Math.pow(Math.sin(Math.PI * t / startup), 2) : 0;
    const pulses = contacts.map((contact, i) => {
      const lead = i === 0 ? startup * .48 : Math.min(.032, (contact - contacts[i - 1]) * .34);
      const tail = i + 1 < contacts.length ? Math.min((contacts[i + 1] - contact) * .50, active * .88)
        : Math.max(.008, (end - contact) * .88);
      return t < contact ? smooth((t - contact + lead) / Math.max(.008, lead)) : 1 - smooth((t - contact) / tail);
    });
    let pulseIndex = 0;
    for (let i = 1; i < pulses.length; i++) if (pulses[i] > pulses[pulseIndex]) pulseIndex = i;
    const strike = pulses[pulseIndex] || 0;
    const recover = clamp((t - startup - active) / recovery, 0, 1);
    const settle = Math.pow(Math.sin(Math.PI * recover), 2) * .16;
    return { wind, strike, settle, pulses, pulseIndex, presence: Math.max(wind, strike),
      phase: t < startup ? 'prepare' : t < startup + active ? 'strike' : 'recover' };
  }
  function combatPose(f, time) {
    const nativeFace = CharacterArt.specs[f.id]?.nativeFace ?? 1;
    const mirrorBody = (f.face < 0 ? -1 : 1) !== nativeFace;
    const local = mirrorBody ? { ...f, face: -f.face, vx: -(f.vx || 0),
      motion: f.motion ? { ...f.motion, travel: -(f.motion.travel || 0), impactDir: -(f.motion.impactDir || 0) } : undefined } : f;
    return { pose: fighterPose(local, f.motionTime ?? time), mirrorBody };
  }
  function fighterPose(f, time) {
    f = fighterBurstView(f);
    if (f.cinematicPose && !fighterVisibleCinema(f)) f = { ...f, cinematicPose: null };
    const j = f.id === 'jotaro', face = f.face < 0 ? -1 : 1, clock = finite(time);
    const grounded = typeof f.grounded === 'boolean' ? f.grounded
      : f.supportId != null && Number.isFinite(f.surfaceY) ? Math.abs(f.y - f.surfaceY) <= 2 : f.y >= 481;
    const m = f.motion || {}, speed = clamp(Math.abs(finite(f.vx)) / Math.max(1, finite(f.speed, 320)), 0, 1);
    const move = clamp(finite(m.move, speed), 0, 1), travel = clamp(finite(m.travel, Math.sign(finite(f.vx)) * speed), -1, 1);
    const air = smooth(finite(m.air, grounded ? 0 : 1)), guard = clamp(finite(m.guard, f.guard ? 1 : 0), 0, 1);
    const dash = smooth(finite(m.dash, f.dash > 0 ? 1 : 0));
    const land = smooth(finite(m.land)), takeoff = smooth(finite(m.takeoff));
    const turn = smooth(finite(m.turn)), impact = smooth(finite(m.impact, f.stun > 0 ? f.stun / .23 : 0));
    const impactDir = clamp(finite(m.impactDir, -face), -1, 1);
    const beat = attackBeat(f.cinematicPose ? null : f.attack);
    const breath = Math.sin(clock * (j ? 2.15 : 1.85)), weightShift = Math.sin(clock * .92 + (j ? .2 : .8));
    const phase = finite(f.runPhase, clock * 13) * .76, stride = Math.sin(phase), opposite = Math.sin(phase + Math.PI);
    const retreat = smooth(-travel * face), gait = smooth(move) * (1 - air * .92) * (1 - guard * .78) * (1 - dash * .65) * (1 - beat.presence * .68);
    const armSize = gait * (1 - retreat * .55);
    const pose = { grounded, lean: breath * (j ? .002 : .0055) + weightShift * (j ? .001 : .003),
      x: weightShift * (j ? .65 : 2.2), y: breath * (j ? 1.2 : 3),
      action: f.cinematicPose ? 'cinematic' : f.attack?.type || (air > .5 ? 'air' : guard > .5 ? 'guard' : move > .1 ? 'move' : 'idle'),
      phase: beat.phase };
    for (const name of poseParts) pose[name] = { angle: 0, x: 0, y: 0 };
    addPose(pose, {
      head: { angle: -breath * (j ? .003 : .009) - weightShift * (j ? .001 : .004) },
      armL: { angle: breath * (j ? .0035 : .009) }, armR: { angle: -breath * (j ? .0035 : .011) },
      foreL: { angle: -breath * (j ? .005 : .012) }, foreR: { angle: breath * (j ? .005 : .014) },
      legL: { angle: weightShift * .0015 }, legR: { angle: -weightShift * .0015 },
      coatL: { angle: Math.sin(clock * 1.6 - .4) * .002 }, coatR: { angle: Math.sin(clock * 1.6 - 1) * .0025 }
    });
    addPose(pose, {
      lean: travel * (j ? .022 : .033) * (1 - retreat) + face * retreat * (j ? .008 : .013),
      x: travel * (j ? 1 : 2), y: -Math.abs(Math.sin(phase * 2)) * (j ? 3 : 5),
      head: { angle: -travel * (j ? .01 : .017) },
      legL: { angle: stride * (j ? .10 : .13) * (1 - retreat * .35) },
      legR: { angle: opposite * (j ? .10 : .13) * (1 - retreat * .35) },
      shinL: { angle: travel * Math.max(0, -stride) * (j ? .145 : .185) },
      shinR: { angle: travel * Math.max(0, stride) * (j ? .145 : .185) },
      coatL: { angle: Math.sin(phase - .8) * .007 }, coatR: { angle: Math.sin(phase - 1.4) * .008 }
    }, gait);
    addPose(pose, {
      armL: { angle: -stride * (j ? .095 : .14) }, armR: { angle: stride * (j ? .10 : .15) },
      foreL: { angle: -.07 + stride * (j ? .075 : .11) }, foreR: { angle: .10 - stride * (j ? .085 : .12) }
    }, armSize);
    addPose(pose, {
      foreL: { angle: -(j ? .12 : .17) }, foreR: { angle: j ? .14 : .20 },
      armL: { angle: -.015 }, armR: { angle: .02 }
    }, gait * retreat);
    // Weight travels through the hips before the shoulders settle on a turn.
    addPose(pose, { lean: -travel * .01, head: { angle: face * .01 },
      foreL: { angle: -.045 }, foreR: { angle: .05 } }, turn * move);

    const rise = smooth(-finite(f.vy) / 600), fall = smooth(finite(f.vy) / 650);
    const apex = 1 - smooth(Math.abs(finite(f.vy)) / 190);
    mixPose(pose, {
      lean: travel * (j ? .012 : .020) + face * fall * .006, x: 0, y: -3 - rise * 3,
      head: { angle: -rise * .012 + fall * .014 },
      armL: { angle: -(j ? .065 : .12) - rise * .025 + fall * .018 },
      armR: { angle: (j ? .065 : .13) + rise * .025 - fall * .018 },
      foreL: { angle: -(j ? .14 : .22) - rise * .055 + fall * .025 },
      foreR: { angle: (j ? .16 : .25) + rise * .055 - fall * .025 },
      legL: { angle: -.035 - rise * .035 + fall * .014 }, legR: { angle: .030 + rise * .027 - fall * .009 },
      shinL: { angle: face * (.065 + rise * .065 + apex * .012) },
      shinR: { angle: face * (.045 + rise * .050 + apex * .008) },
      coatL: { angle: -.008 - rise * .010 + fall * .006 }, coatR: { angle: .007 + rise * .009 - fall * .005 }
    }, air);
    addPose(pose, { lean: -face * .008, legL: { angle: -face * .017 }, legR: { angle: face * .013 },
      shinL: { angle: face * .02 }, shinR: { angle: face * .015 } }, takeoff);
    addPose(pose, { lean: -face * .018, y: j ? 8 : 13,
      // Both knees travel toward the fighter's front while the shins counter-
      // rotate. Ground contact then lowers the hips rather than widening a leg.
      legL: { angle: -face * .075 }, legR: { angle: -face * .065 },
      shinL: { angle: face * .12 }, shinR: { angle: face * .11 },
      head: { angle: face * .012 }, coatL: { angle: -.007 }, coatR: { angle: .006 }
    }, land);

    mixPose(pose, { lean: travel * (j ? .058 : .085), y: j ? 7 : 12,
      head: { angle: -travel * .022 },
      legL: { angle: -travel * (j ? .095 : .13) }, legR: { angle: travel * (j ? .11 : .15) },
      shinL: { angle: travel * .08 }, shinR: { angle: travel * .06 },
      armL: { angle: travel * .08 }, armR: { angle: -travel * .095 },
      foreL: { angle: -.17 }, foreR: { angle: .21 },
      coatL: { angle: travel * .016 }, coatR: { angle: travel * .017 }
    }, dash);

    const guardPose = { lean: -face * (j ? .025 : .038), y: j ? 7 : 13,
      head: { angle: face * .008 }, armL: { angle: j ? .04 : -.06 }, armR: { angle: .02 },
      foreL: { angle: j ? 2.10 : -1.65 }, foreR: { angle: j ? 2.05 : 2.12 },
      legL: { angle: -.018 }, legR: { angle: .016 }, shinL: { angle: face * .025 }, shinR: { angle: face * .02 }
    };
    // Ease the first arm lift out of a dash without changing the final guard.
    mixPose(pose, guardPose, smooth(guard) * (1 - beat.presence * .9));
    if (f.blockStun) addPose(pose, { lean: impactDir * .018, x: impactDir * 3,
      foreL: { angle: .045 }, foreR: { angle: -.04 }, head: { angle: impactDir * .009 } }, impact);

    if (f.attack && !f.cinematicPose) {
      const type = f.attack.type, combo = clamp(Math.round(finite(f.attack.combo, 1)), 1, 5);
      const motionKey = type === 'melee' ? f.attack.motionKey || ['jab', 'cross', 'body', 'double', 'finisher'][combo - 1] : type;
      const power = j ? .9 : 1;
      const attacks = {
        jab: { lean: face * .026, x: face * 3, armL: { angle: j ? .055 : .12 }, foreL: { angle: j ? 1.52 : 2.10 }, armR: { angle: .025 }, foreR: { angle: .07 } },
        cross: { lean: face * .039, x: face * 4, armL: { angle: -.025 }, foreL: { angle: -.11 }, armR: { angle: .10 }, foreR: { angle: j ? 1.85 : 1.95 } },
        body: { lean: face * .053, x: face * 5, y: 6, armL: { angle: .025 }, foreL: { angle: j ? 1.02 : 2.23 }, armR: { angle: .035 }, foreR: { angle: j ? 1.18 : .45 },
          legL: { angle: -face * .055 }, legR: { angle: -face * .045 }, shinL: { angle: face * .085 }, shinR: { angle: face * .075 }, head: { angle: -face * .012 } },
        double: { lean: face * .023, x: face * 3, armL: { angle: .055 }, foreL: { angle: j ? 1.55 : 2.05 }, armR: { angle: .025 }, foreR: { angle: j ? .42 : .54 } },
        doubleReturn: { lean: face * .036, x: face * 4, armL: { angle: -.015 }, foreL: { angle: j ? .48 : -.22 }, armR: { angle: .11 }, foreR: { angle: j ? 1.92 : 2.05 }, head: { angle: -face * .008 } },
        finisher: { lean: face * .062, x: face * 8, armL: { angle: .045 }, foreL: { angle: j ? 1.95 : 1.55 }, armR: { angle: .09 }, foreR: { angle: j ? 1.97 : 2.4 },
          legL: { angle: -.035 }, legR: { angle: .028 }, shinL: { angle: face * .025 }, shinR: { angle: face * .02 }, head: { angle: -face * .016 }, coatL: { angle: -.01 }, coatR: { angle: .012 } },
        upper: { lean: face * .027, x: face * 2, y: -7, armL: { angle: j ? .03 : -.08 }, foreL: { angle: j ? 2.1 : -.45 }, armR: { angle: j ? .07 : -.02 }, foreR: { angle: j ? .55 : 2.45 }, head: { angle: -.014 }, shinL: { angle: face * .025 } },
        heavy: { lean: face * .064, x: face * 7, y: 5, armL: { angle: .055 }, foreL: { angle: j ? 1.15 : 1.45 }, armR: { angle: .14 }, foreR: { angle: j ? 2.0 : 2.2 }, legL: { angle: -.035 }, legR: { angle: .03 }, head: { angle: face * .013 } },
        ranged: { lean: -face * .015, x: face * 2, armL: { angle: j ? .07 : -.055 }, foreL: { angle: j ? 1.65 : -.25 }, armR: { angle: j ? .01 : .055 }, foreR: { angle: j ? .4 : 2.0 }, head: { angle: -face * .01 } },
        super: { lean: face * .012, armL: { angle: -.08 }, foreL: { angle: -.27 }, armR: { angle: .09 }, foreR: { angle: .35 } }
      };
      const strike = attacks[motionKey] || (motionKey === 'kick' ? attacks.body : attacks.jab), finish = motionKey === 'finisher';
      addPose(pose, { lean: -face * (type === 'heavy' || finish ? .022 : .011), x: -face * (finish ? 3.5 : 2),
        y: type === 'upper' || type === 'heavy' || ['body', 'kick'].includes(motionKey) ? 5 : 1,
        armL: { angle: .025 }, foreL: { angle: type === 'upper' ? -.18 : -.075 },
        armR: { angle: -.025 }, foreR: { angle: finish ? .52 : type === 'heavy' ? .25 : .12 },
        head: { angle: face * .009 }, coatL: { angle: -.004 }, coatR: { angle: .004 }
      }, beat.wind * power);
      if (motionKey === 'double') {
        addPose(pose, strike, finite(beat.pulses[0], beat.strike) * power);
        addPose(pose, attacks.doubleReturn, finite(beat.pulses[1]) * power);
      } else addPose(pose, strike, beat.strike * power);
      addPose(pose, { lean: -face * .016, head: { angle: face * .012 },
        foreL: { angle: -.08 }, foreR: { angle: finish ? .24 : .11 }, coatL: { angle: finish ? .027 : .015 }, coatR: { angle: finish ? -.023 : -.013 }
      }, beat.settle * power);
    }
    if (!f.blockStun) addPose(pose, { lean: impactDir * (j ? .059 : .085), x: impactDir * (j ? 4 : 7),
      head: { angle: impactDir * (j ? .027 : .038) }, armL: { angle: -.07 }, armR: { angle: .09 },
      foreL: { angle: .045 }, foreR: { angle: -.06 }, coatL: { angle: impactDir * .01 }, coatR: { angle: impactDir * .012 }
    }, impact);

    const cinema = f.cinematicPose;
    if (cinema) {
      const p = clamp(finite(cinema.progress), 0, 1), pulse = smooth(finite(cinema.pulse));
      const timeline = fighterCinematicTimeline(f.id, cinema), starts = timeline.starts, durations = timeline.phases;
      const cueTime = finite(cinema.t, (starts[cinema.phase] || 0) + p * (durations[cinema.phase] || .3));
      const finalPeak = timeline.finalOffset / durations.finish;
      const ready = { lean: face * (j ? .007 : .015), x: 0, y: 0,
        head: { angle: -face * (j ? .01 : .018) }, armL: { angle: j ? -.055 : -.12 }, armR: { angle: j ? .055 : .12 },
        foreL: { angle: j ? .08 : -.32 }, foreR: { angle: j ? 1.78 : 1.92 },
        legL: { angle: -.012 }, legR: { angle: .01 }, shinL: { angle: 0 }, shinR: { angle: 0 },
        coatL: { angle: -.004 }, coatR: { angle: .004 }
      };
      const cinematicWeight = cinema.role === 'attacker' && cinema.phase === 'recover' ? 1 - smooth(p) : 1;
      if (cinema.role === 'attacker') {
        mixPose(pose, ready, cinematicWeight);
        const command = cinema.phase === 'freeze' ? 0 : cinema.phase === 'approach' ? smooth(p)
          : cinema.phase === 'rush' ? 1 : cinema.phase === 'finish' ? 1 - smooth(p) : 0;
        const rhythm = fighterCinematicBeat(timeline, cueTime);
        const rhythmic = cinema.phase === 'rush' ? (rhythm.index % 2 ? -1 : 1) * rhythm.pulse : 0;
        addPose(pose, { lean: face * (j ? .006 : .012), armL: { angle: j ? -.025 : -.04 },
          armR: { angle: j ? .022 : .04 }, foreL: { angle: j ? .06 : -.10 }, foreR: { angle: j ? .075 : .12 }
        }, command);
        addPose(pose, { head: { angle: rhythmic * (j ? .002 : .004) },
          armL: { angle: rhythmic * .003 }, armR: { angle: -rhythmic * .003 }
        }, command);
        const finalStrike = cinema.phase === 'finish' ? (p < finalPeak ? smooth(p / finalPeak) : 1 - smooth((p - finalPeak) / (1 - finalPeak))) : 0;
        addPose(pose, { lean: face * (j ? .015 : .027), x: face * 3,
          foreL: { angle: -.08 }, foreR: { angle: .10 }, coatL: { angle: -.009 }, coatR: { angle: .009 }
        }, finalStrike);
      } else if (cinema.blocked) {
        mixPose(pose, guardPose, cinematicWeight);
        const contact = cinema.phase === 'rush' || cinema.phase === 'finish' ? pulse : 0;
        addPose(pose, { lean: -face * .016, x: -face * 3,
          foreL: { angle: .035 }, foreR: { angle: -.035 }, head: { angle: -face * .008 }
        }, contact * cinematicWeight);
      } else {
        const caught = cinema.phase === 'freeze' ? 0 : cinema.phase === 'approach' ? smooth(p) : 1;
        const finalStrike = cinema.phase === 'finish' ? (p < finalPeak ? smooth(p / finalPeak) : 1 - smooth((p - finalPeak) / (1 - finalPeak))) : 0;
        mixPose(pose, { lean: -face * .018, head: { angle: -face * .012 },
          armL: { angle: -.025 }, armR: { angle: .035 }, foreL: { angle: -.025 }, foreR: { angle: .035 },
          legL: { angle: -.014 }, legR: { angle: .016 }, shinL: { angle: 0 }, shinR: { angle: 0 }
        }, caught);
        addPose(pose, { lean: -face * (j ? .037 : .055), x: -face * 5,
          head: { angle: -face * .025 }, armL: { angle: -.045 }, armR: { angle: .055 }
        }, (cinema.phase === 'rush' ? pulse : finalStrike) * cinematicWeight);
      }
    }
    if (f.burstT > 0) {
      const duration = typeof CombatGeometry !== 'undefined' && CombatGeometry.rules.burst?.poseDuration || .38;
      const progress = clamp(1 - f.burstT / duration, 0, 1);
      const release = smooth((progress - .15) / .16) * (1 - smooth((progress - .46) / .29));
      const settle = 1 - smooth((progress - .73) / .27);
      // A short rigid brace/open/recover pose wins over the interrupted action.
      // Its joints stay within the same limits and preserve every source pixel.
      pose.action = 'burst'; pose.phase = progress < .20 ? 'burst-brace' : progress < .50 ? 'burst-release'
        : progress < .79 ? 'burst-settle' : 'burst-ready';
      mixPose(pose, { lean: -face * .009, x: 0, y: 4 * (1 - release),
        head: { angle: -face * .012 }, armL: { angle: -.08 - release * .08 }, armR: { angle: .08 + release * .08 },
        foreL: { angle: (j ? 1.75 : -1.4) * (1 - release * .72) }, foreR: { angle: (j ? 1.80 : 1.9) * (1 - release * .72) },
        legL: { angle: -.025 }, legR: { angle: .025 }, shinL: { angle: face * .035 }, shinR: { angle: face * .03 },
        coatL: { angle: -.012 - release * .015 }, coatR: { angle: .012 + release * .015 }
      }, settle);
    }
    // Defensive limits protect rigid cutout joints even when several short
    // transitions overlap (landing into guard, or a turn interrupted by a hit).
    pose.lean = clamp(pose.lean, -.105, .105);
    const limits = { head: .065, armL: j ? .23 : .34, armR: j ? .23 : .34,
      foreL: 2.25, foreR: 2.5, legL: j ? .16 : .19, legR: j ? .16 : .19,
      shinL: j ? .22 : .25, shinR: j ? .22 : .25, coatL: .032, coatR: .032 };
    const unit = j ? 756 / 1303 : 1;
    pose.x = clamp(finite(pose.x), -14, 14) * unit;
    pose.y = clamp(finite(pose.y), -18, 18) * unit;
    for (const name of poseParts) {
      pose[name].angle = clamp(finite(pose[name].angle), -limits[name], limits[name]);
      pose[name].x = clamp(finite(pose[name].x), -12, 12) * unit;
      pose[name].y = clamp(finite(pose[name].y), -12, 12) * unit;
    }
    return pose;
  }
  // Source contact points use exactly the same joint/body matrices as pixels.
  // These queries work before the cached cutout canvases are ready as well.
  function posedPoint(id, sourcePoint, pose = {}, partName = null) {
    const config = configs[id];
    if (!config) return [...sourcePoint];
    const base = joint(config.hip, pose.lean, pose.x, pose.y);
    const part = config.parts.find(part => part.name === partName);
    if (!part) return point(base, sourcePoint);
    const p = pose[partName] || {};
    return point(multiply(base, joint(part.pivot, p.angle, p.x, p.y)), sourcePoint);
  }
  function aimPoint(id, pose, partName, sourcePoint, target) {
    const config = configs[id];
    if (!config) return;
    const part = config.parts.find(part => part.name === partName);
    if (!part) return;
    const base = joint(config.hip, pose.lean, pose.x, pose.y);
    // Rigid inverse of the body transform; no stretching is involved.
    const dx = target[0] - base[4], dy = target[1] - base[5];
    const local = [base[0] * dx + base[1] * dy, base[2] * dx + base[3] * dy];
    const p = pose[partName] || {}, rotated = point(joint(part.pivot, p.angle), sourcePoint);
    pose[partName] = { ...p, x: local[0] - rotated[0], y: local[1] - rotated[1] };
  }
  return Object.freeze({ prepare, paint, fighterPose, attackBeat, combatPose, posedPoint, aimPoint,
    supports: id => Object.prototype.hasOwnProperty.call(configs, id) });
})();

const StandContacts = Object.freeze({
  ...Object.fromEntries(Object.entries(fighterExpansionArt.contacts || {}).filter(([, info]) =>
    info && typeof info.art === 'string' && CharacterArt.specs[info.art] && Array.isArray(info.fistL)
    && info.fistL.length === 2 && info.fistL.every(Number.isFinite))
    .map(([id, info]) => [id, Object.freeze({ ...info, nativeFace: info.nativeFace < 0 ? -1 : 1,
      fistL: Object.freeze([...info.fistL]), ...(info.fistR ? { fistR: Object.freeze([...info.fistR]) } : {}) })])),
  jotaro: Object.freeze({ art: 'star-platinum', nativeFace: 1,
    fistL: Object.freeze([949, 820]) }),
  dio: Object.freeze({ art: 'the-world', nativeFace: -1,
    fistL: Object.freeze([590, 588]), fistR: Object.freeze([824, 648]) })
});

function standPlacement(id, x, y, height, dir = 1, options = {}) {
  const info = StandContacts[id];
  if (!info) return null;
  const spec = CharacterArt.specs[info.art];
  const scale = height / spec.rect[3], mirror = (dir < 0 ? -1 : 1) * info.nativeFace;
  const hand = options.anchorHand ?? options.hand ?? 'fistL';
  const tip = options.anchorPoint || info[hand] || info.fistL;
  const point = JojoRig.posedPoint(info.art, tip, options.anchorPose || options.pose || {}, hand);
  const p = { info, scale, mirror, x: x - mirror * (point[0] - spec.anchorX) * scale,
    y: y - (point[1] - spec.rect[1] - spec.rect[3]) * scale, angle: 0 };
  if (!JojoRig.supports(info.art) && Number.isFinite(options.groundY)) {
    const [sx, sy, sw, sh] = spec.rect;
    const corners = [[sx, sy], [sx + sw, sy], [sx + sw, sy + sh], [sx, sy + sh]]
      .map(([px, py]) => [mirror * (px - point[0]) * scale, (py - point[1]) * scale]);
    const direction = dir < 0 ? -1 : 1, limit = Math.max(0, options.groundY - y);
    const bottom = angle => Math.max(...corners.map(([px, py]) => Math.sin(angle * direction) * px + Math.cos(angle) * py));
    if (bottom(0) > limit && bottom(Math.PI / 2) <= limit) {
      let lo = 0, hi = Math.PI / 2;
      for (let i = 0; i < 12; i++) { const mid = (lo + hi) * .5; if (bottom(mid) > limit) lo = mid; else hi = mid; }
      p.angle = direction * hi;
    }
  }
  return p;
}

// x/y is the front of the striking knuckles, never the source image bottom.
// Optional pose/anchorPose keeps an animated fist's rest anchor stationary.
function drawStandAtContact(ctx, id, x, y, height, dir = 1, opacity = 1, options = {}) {
  const p = standPlacement(id, x, y, height, dir, options);
  if (!p) return false;
  ctx.save(); ctx.translate(x, y); ctx.rotate(p.angle); ctx.translate(p.x - x, p.y - y); ctx.scale(p.mirror, 1);
  CharacterArt.articulate(ctx, p.info.art, 0, 0, height, options.pose || {}, opacity);
  ctx.restore();
  return true;
}

function standContactBounds(id, x, y, height, dir = 1, options = {}) {
  const p = standPlacement(id, x, y, height, dir, options);
  if (!p) return { left: x, right: x, top: y, bottom: y };
  const g = CharacterArt.geometry(p.info.art, height);
  const points = [[g.dx, g.dy], [g.dx + g.dw, g.dy], [g.dx + g.dw, 0], [g.dx, 0]].map(([dx, dy]) => {
    const px = p.x - x + p.mirror * dx, py = p.y - y + dy;
    return [x + Math.cos(p.angle) * px - Math.sin(p.angle) * py, y + Math.sin(p.angle) * px + Math.cos(p.angle) * py];
  });
  // Rush retraction moves the body behind its extended contact anchor. Include
  // that small excursion while retaining the original image's vertical bounds.
  const reach = height * .16;
  return { left: Math.min(...points.map(p => p[0])) - (dir > 0 ? reach : 0),
    right: Math.max(...points.map(p => p[0])) + (dir < 0 ? reach : 0),
    top: Math.min(...points.map(p => p[1])) - 4, bottom: Math.max(...points.map(p => p[1])) + 4 };
}

function drawStandArt(ctx, id, x, y, height, opacity = 1, dir = 1) {
  const info = StandContacts[id];
  if (!info) return false;
  ctx.save(); ctx.translate(x, y); ctx.scale((dir < 0 ? -1 : 1) * info.nativeFace, 1);
  CharacterArt.paint(ctx, info.art, 0, 0, height, opacity);
  ctx.restore();
}

function drawStandRush(ctx, id, x, y, height, phase, dir = 1, intensity = 1) {
  const cue = typeof phase === 'number' ? { t: phase, phase: 'rush', pulse: 0, progress: 0 } : phase;
  const timeline = fighterCinematicTimeline(id, cue);
  const time = cue.t || 0, active = cue.phase === 'rush', finishing = cue.phase === 'finish';
  // Alternating fists peak on the same contact clock as damage, even when
  // the two characters have different recording lengths and punch counts.
  const rhythm = fighterCinematicBeat(timeline, time), cycle = rhythm.cycle;
  const punchWave = id === 'jotaro' ? rhythm.pulse : rhythm.left;
  // Final extension reaches the real final contact at 80 ms into finish.
  const finalProgress = Math.max(0, Math.min(1, cue.progress || 0));
  const finalPeak = timeline.finalOffset / timeline.phases.finish;
  const finalWave = finalProgress < finalPeak ? finalProgress / finalPeak
    : Math.max(0, 1 - (finalProgress - finalPeak) / .55);
  const left = active ? Math.pow(punchWave, .65) : finishing ? finalWave : 0;
  const right = active ? Math.pow(rhythm.right, .65) : 0;
  const force = Math.min(1.3, Math.max(0, intensity));
  const info = StandContacts[id];
  if (!info) return;
  const native = info.nativeFace;
  if (!JojoRig.supports(info.art)) {
    // A complete generated model stays whole, including Made in Heaven's
    // equine body. A small rigid retraction reaches the actual impact surface.
    const pulse = active ? rhythm.pulse : finishing ? finalWave : 0;
    const retract = height * .10 * (1 - pulse);
    const impactX = Number.isFinite(cue.impactX) ? cue.impactX : x;
    const impactY = Number.isFinite(cue.impactY) ? cue.impactY : y;
    drawStandAtContact(ctx, id, impactX - (dir < 0 ? -1 : 1) * retract, impactY,
      height, dir, active || finishing ? .94 : .80);
    return;
  }
  const unit = height / CharacterArt.specs[info.art].rect[3];
  const target = [info.fistL[0] + native * height * .15 / unit, info.fistL[1]];
  const contactTarget = [target[0] + (Number.isFinite(cue.impactX) ? (cue.impactX - x) * native * (dir < 0 ? -1 : 1) / unit : 0),
    target[1] + (Number.isFinite(cue.impactY) ? (cue.impactY - y) / unit : 0)];
  const pose = {
    lean: active ? Math.sin(cycle) * .012 : finishing ? native * .018 * finalWave : 0,
    x: 0, y: active ? Math.sin(cycle * .5) * 3 : 0,
    head: { angle: active ? Math.sin(cycle + 1) * .018 : 0 },
    fistL: { angle: native * left * .065 }, fistR: { angle: -native * right * .055 },
    echo: active ? native * force : 0
  };
  for (const [hand, amount] of [['fistL', left], ['fistR', right]]) if (info[hand]) {
    const tip = info[hand];
    JojoRig.aimPoint(info.art, pose, hand, tip,
      [tip[0] + (contactTarget[0] - tip[0]) * amount, tip[1] + (contactTarget[1] - tip[1]) * amount]);
  }
  drawStandAtContact(ctx, id, x, y, height, dir, .94, { pose, anchorPose: {}, anchorPoint: target, anchorHand: 'body' });
}

function drawStandStrike(ctx, f, x, y, height, opacity) {
  const a = f.attack, geometry = typeof CombatGeometry !== 'undefined' ? CombatGeometry : null;
  const rule = geometry?.profile(a.type), beat = JojoRig.attackBeat({ ...a,
    contactTimes: a.contactTimes || rule?.contactTimes }), dir = f.face < 0 ? -1 : 1;
  const key = a.motionKey || a.type, two = key === 'double', heavy = key === 'finisher' || key === 'heavy'
    || a.type === 'starAscend' && beat.pulseIndex === 2 || a.type === 'timeAmbush' && beat.pulseIndex === 1;
  const info = StandContacts[f.id];
  if (!info) return;
  const native = info.nativeFace;
  if (!JojoRig.supports(info.art)) {
    const contact = geometry?.commandPose(f, a)?.contactIndex;
    const path = geometry?.strike(f, a, contact >= 0 ? contact : beat.pulseIndex);
    const targetX = path?.x ?? x, targetY = path?.y ?? y;
    // Root/space/high strike travel is visibly tied to the authored path;
    // ordinary contacts use a short retreat without inventing extra reach.
    const startX = rule?.points ? path.startX : targetX - dir * 20 * (height / 145);
    const startY = rule?.points ? path.startY : targetY;
    drawStandAtContact(ctx, f.id, startX + (targetX - startX) * beat.strike,
      startY + (targetY - startY) * beat.strike, height, dir, opacity,
      { groundY: Number.isFinite(f.shadowY) ? f.shadowY : f.grounded ? f.y : undefined });
    return;
  }
  const unit = height / CharacterArt.specs[info.art].rect[3];
  const target = [info.fistL[0] + native * height * .13 / unit, info.fistL[1]];
  const left = two && info.fistR ? beat.pulses[0] || 0 : beat.strike;
  const right = two && info.fistR ? beat.pulses[1] || 0 : 0;
  const pose = { lean: native * (heavy ? .018 : .01) * beat.strike,
    head: { angle: -native * beat.strike * .01 },
    fistL: { angle: native * left * .04 }, fistR: { angle: -native * right * .04 } };
  for (const [hand, amount] of [['fistL', left], ['fistR', right]]) if (info[hand]) {
    const tip = info[hand];
    JojoRig.aimPoint(info.art, pose, hand, tip,
      [tip[0] + (target[0] - tip[0]) * amount, tip[1] + (target[1] - tip[1]) * amount]);
  }
  if (a.type === 'upper' || a.type === 'heavy' || a.type === 'starAscend') {
    const size = typeof CombatGeometry !== 'undefined' ? CombatGeometry.scale(f) : (f.height || 222) / 222;
    const path = typeof CombatGeometry !== 'undefined' ? CombatGeometry.strike(f, a, beat.pulseIndex)
      : { startX: f.x + dir * (a.type === 'upper' ? 30 : 26) * size,
        startY: f.y - (a.type === 'upper' ? 72 : 60) * size };
    // The Stand itself climbs through the uppercut or sweeps across the low
    // lane. Its real knuckles arrive at the shared contact point at startup;
    // every source pixel retains the same scale throughout this translation.
    x = path.startX + (x - path.startX) * beat.strike;
    y = path.startY + (y - path.startY) * beat.strike;
  }
  drawStandAtContact(ctx, f.id, x, y, height, dir, opacity,
    { pose, anchorPose: {}, anchorPoint: target, anchorHand: 'body' });
}

function drawKnockedCombatant(ctx, f, height) {
  const sprites = typeof JojoActionSprites !== 'undefined' ? JojoActionSprites : null;
  let layout = sprites?.knockdownLayout?.(f);
  if (!layout) {
    const kd = f.knockdown, duration = typeof KNOCKDOWN_TIMING !== 'undefined' ? KNOCKDOWN_TIMING : { fall: .20, rise: .30 };
    const clamp = value => Math.max(0, Math.min(1, value)), smooth = value => { const u = clamp(value); return u * u * (3 - 2 * u); };
    const dir = kd.dir < 0 ? -1 : 1, t = Number.isFinite(kd.t) ? kd.t : 0;
    const angle = dir * Math.PI * .5 * (kd.phase === 'fall' ? Math.pow(clamp(t / duration.fall), 1.45)
      : kd.phase === 'rise' ? 1 - smooth(t / (duration.rise * .8)) : 1);
    const facing = (f.face < 0 ? -1 : 1) * (CharacterArt.specs[f.id]?.nativeFace ?? 1);
    const g = CharacterArt.geometry(f.id, height) || { dx: -height * .25, dy: -height, dw: height * .50 };
    const cosine = Math.cos(angle), sine = Math.sin(angle);
    const points = [[g.dx, g.dy], [g.dx + g.dw, g.dy], [g.dx + g.dw, 0], [g.dx, 0]]
      .map(([x, y]) => [cosine * x * facing - sine * y, sine * x * facing + cosine * y]);
    const bottom = Math.max(...points.map(p => p[1])), originY = f.y - bottom;
    const bounds = { left: f.x + Math.min(...points.map(p => p[0])), right: f.x + Math.max(...points.map(p => p[0])),
      top: originY + Math.min(...points.map(p => p[1])), bottom: f.y };
    layout = { groundY: f.y, bounds, layers: [{ x: f.x, y: originY, angle, facing, sheet: 'original' }] };
  }
  const bounds = layout.bounds, shadowY = f.grounded === true ? layout.groundY
    : Number.isFinite(f.shadowY) ? f.shadowY : layout.groundY;
  const elevation = Math.max(0, shadowY - f.y), width = bounds.right - bounds.left;
  ctx.save(); ctx.fillStyle = `rgba(4,6,15,${Math.max(.08, .27 - elevation * .0006)})`;
  ctx.beginPath(); ctx.ellipse((bounds.left + bounds.right) * .5, shadowY + 2, Math.max(12, width * .40), 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (sprites?.drawKnockdown?.(ctx, f)) return;
  const layer = layout.layers[0];
  ctx.save(); ctx.translate(layer.x, layer.y); ctx.rotate(layer.angle); ctx.scale(layer.facing, 1);
  if (!CharacterArt.paint(ctx, f.id, 0, 0, height)) sprites?.drawPortrait?.(ctx, f.id, 0, 0, height, 1);
  ctx.restore();
}

function drawCombatant(ctx, f, t) {
  f = fighterBurstView(f);
  if (f.cinematicPose && !fighterVisibleCinema(f)) f = { ...f, cinematicPose: null };
  const height = f.height || (f.id === 'jotaro' ? 1303 : 1313) * CharacterArt.bodyScale;
  const geometry = typeof CombatGeometry !== 'undefined' ? CombatGeometry : null;
  const size = geometry ? geometry.scale(f) : height / 222;
  const phase = f.motionTime ?? t;
  const attack = f.attack, rule = attack && geometry?.profile(attack.type);
  const ranged = attack && (rule?.projectile || ['ranged', 'dashRanged', 'rangedUp', 'rangedLow', 'assist'].includes(attack.type));
  const signature = attack && (rule?.style || ['starAscend', 'starCounter', 'timeAmbush', 'knifeArray'].includes(attack.type));
  const castSignature = attack?.type === 'knifeArray' || rule?.projectile;
  const commandCue = signature && geometry?.commandPose(f, attack);
  const blinkRule = geometry?.profile('timeAmbush'), blinkAt = blinkRule?.blinkAt ?? .18;
  const blinkStart = blinkRule?.blinkInvStart ?? blinkAt - .04, blinkEnd = blinkRule?.blinkInvEnd ?? blinkAt + .05;
  const blinkHidden = attack?.type === 'timeAmbush' && (commandCue ? commandCue.phase === 'blink-hidden'
    : attack.t >= blinkStart && attack.t < blinkEnd);
  const dashRule = rule?.dashStart != null ? rule : geometry?.profile('dashRanged'), dashStart = dashRule?.dashStart ?? .04;
  const dashEnd = dashRule?.dashEnd ?? .20, dashRelease = attack?.startup ?? .25;
  const hasDashCommand = attack?.type === 'dashRanged' || rule?.dashStart != null;
  const commandDash = hasDashCommand && attack.t >= dashStart && attack.t < dashRelease;
  const chargeRule = rule?.chargeStart != null ? rule : null;
  const chargeStart = chargeRule?.chargeStart ?? .16, chargeEnd = chargeRule?.chargeEnd ?? .48;
  const chargeAge = attack?.t || 0;
  const chargeStop = Number.isFinite(attack?.chargeStoppedAt) ? attack.chargeStoppedAt : chargeEnd;
  const charging = chargeRule && chargeAge >= chargeStart && chargeAge < chargeStop + .10;

  ctx.save();
  if (f.knockdown) {
    drawKnockedCombatant(ctx, f, height);
    if (!f.previewClean && typeof BattleVFX !== 'undefined') BattleVFX.drawStatus?.(ctx, f);
    ctx.restore(); return;
  }
  const shadowY = Number.isFinite(f.shadowY) ? f.shadowY : Number.isFinite(f.surfaceY) ? f.surfaceY : 483;
  const elevation = Math.max(0, (shadowY - f.y) / 300);
  ctx.fillStyle = `rgba(4,6,15,${Math.max(.1, .32 - elevation * .16)})`;
  ctx.beginPath(); ctx.ellipse(f.x, shadowY + 3, 36 - Math.min(10, elevation * 10), 6, 0, 0, Math.PI * 2); ctx.fill();
  if (signature && typeof BattleVFX !== 'undefined' && typeof BattleVFX.drawSignature === 'function') {
    BattleVFX.drawSignature(ctx, f, phase, 'back');
  }
  if (attack?.type === 'timeAmbush' && attack.t >= blinkStart && attack.t < blinkAt + .24 && !f.previewClean && !f.cinematicPose) {
    const source = attack.blinkOrigin || f, alpha = .32 * Math.max(0, 1 - Math.max(0, attack.t - blinkAt) / .24);
    if (typeof JojoActionSprites !== 'undefined') {
      ctx.save(); ctx.globalAlpha *= alpha;
      // The marked silhouette stays at the source coordinate and uses one
      // immutable ready frame. It never records positions during rendering.
      if (!JojoActionSprites.drawFrame(ctx, f.id, 'motion', 0, source.x, source.y, height, f.face))
        JojoActionSprites.drawPortrait(ctx, f.id, source.x, source.y, height, f.face);
      ctx.restore();
    }
  }
  if (charging && !f.previewClean && !f.cinematicPose && typeof JojoActionSprites !== 'undefined') {
    const origin = attack.chargeOrigin || f, dx = f.x - origin.x, dy = f.y - origin.y;
    const distance = Math.hypot(dx, dy), fade = Math.max(0, 1 - Math.max(0, chargeAge - chargeStop) / .10);
    const cue = JojoActionSprites.sample(f, phase);
    // Interpolate within the displacement committed by physics. A blocked
    // charge cannot leave images past the wall or behind its original start.
    for (let i = 3; i > 0 && distance > .1; i--) {
      const trail = Math.min(1, (17 + i * 19) * size / distance);
      ctx.save(); ctx.globalAlpha *= (.18 - i * .037) * fade;
      JojoActionSprites.drawFrame(ctx, f.id, cue.sheet, cue.index, f.x - dx * trail, f.y - dy * trail, height, cue.facing);
      ctx.restore();
    }
  }
  if (((f.dash > 0 && !attack) || commandDash) && !(f.stun > 0) && !f.cinematicPose && !f.previewClean) {
    if (typeof BattleVFX !== 'undefined' && typeof BattleVFX.drawDash === 'function') BattleVFX.drawDash(ctx, f, phase);
    if (typeof JojoActionSprites !== 'undefined' && typeof JojoActionSprites.sample === 'function'
      && typeof JojoActionSprites.drawFrame === 'function') {
      const cue = JojoActionSprites.sample(f, phase), timing = fighterDashTiming();
      const dir = commandDash ? (f.face < 0 ? -1 : 1)
        : f.dashDir < 0 ? -1 : f.dashDir > 0 ? 1 : f.face < 0 ? -1 : 1;
      const elapsed = Math.max(0, timing.duration - f.dash);
      const strength = commandDash ? Math.min(1, (attack.t - dashStart) / .025)
        * Math.max(0, Math.min(1, (dashRelease - attack.t) / Math.max(.01, dashRelease - dashEnd)))
        : Math.min(1, elapsed / Math.max(.01, timing.lead)) * Math.min(1, f.dash / timing.brake);
      const traveled = commandDash ? Math.max(0, Math.min(attack.t, dashEnd) - dashStart) * (dashRule?.dashSpeed || 650) * size
        : f.dashOrigin ? Math.hypot(f.x - f.dashOrigin.x, f.y - f.dashOrigin.y) : elapsed * timing.speed;
      for (let i = commandDash ? 2 : 3; i > 0; i--) {
        ctx.save(); ctx.globalAlpha *= [0, .20, .11, .055][i] * strength;
        const offset = Math.min(traveled, (7 + i * 21) * size);
        JojoActionSprites.drawFrame(ctx, f.id, cue.sheet, cue.index, f.x - dir * offset, f.y, height, cue.facing);
        ctx.restore();
      }
    }
  }
  const bodyNormal = (f.attack?.type === 'melee' && f.attack.combo <= 3) || (!f.attack && f.combo > 0 && f.combo <= 3);
  const preparingDash = hasDashCommand && attack.t < dashEnd;
  if (f.standT > 0 && !f.standDetached && !f.previewClean && !bodyNormal && !preparingDash && !blinkHidden && !['knifeArray', 'starCounter'].includes(attack?.type)) {
    const appear = Math.min(1, (f.standAge || 0) / .06, f.standT / .16);
    const normal = attack && !ranged && !castSignature;
    const beat = JojoRig.attackBeat(attack ? { ...attack, contactTimes: attack.contactTimes || rule?.contactTimes } : null);
    const contact = commandCue?.phase === 'contact' ? commandCue.contactIndex : beat.pulseIndex;
    const point = normal && geometry ? geometry.strike(f, f.attack, Math.max(0, contact))
      : geometry ? geometry.castPoint(f, attack?.type)
      : { x: f.x + (f.face < 0 ? -1 : 1) * 130 * size, y: f.y - 175 * size };
    const auraRadius = (normal ? 58 : 66) * size;
    const auraX = point.x - f.face * 30 * size, auraY = point.y - 34 * size;
    const aura = ctx.createRadialGradient(auraX, auraY, 0, auraX, auraY, auraRadius);
    aura.addColorStop(0, (StandContacts[f.id]?.color || fighterAuraColors[f.id] || '#aabbd0') + (normal ? '12' : '1a'));
    aura.addColorStop(1, '#00000000');
    ctx.save(); ctx.globalAlpha *= appear;
    ctx.fillStyle = aura; ctx.fillRect(auraX - auraRadius, auraY - auraRadius, auraRadius * 2, auraRadius * 2);
    ctx.restore();
    if (normal) {
      drawStandStrike(ctx, f, point.x, point.y, 145 * size * (StandContacts[f.id]?.heightScale || 1), appear * (f.attack.type === 'melee' ? .40 : .88));
    } else {
      const charge = attack ? Math.max(0, Math.min(1, (attack.t || 0) / Math.max(.01, attack.startup || .08))) : 0;
      const angle = rule?.angle ?? (attack?.type === 'rangedUp' ? -Math.PI / 5 : 0);
      const retreat = (1 - charge) * 22 * size;
      drawStandAtContact(ctx, f.id, point.x - f.face * Math.cos(angle) * retreat,
        point.y - Math.sin(angle) * retreat, 148 * size * (StandContacts[f.id]?.heightScale || 1), f.face, appear * .86,
        { groundY: Number.isFinite(f.shadowY) ? f.shadowY : f.grounded ? f.y : undefined,
          pose: { lean: Math.sin(phase * 3) * .008,
          head: { angle: Math.sin(phase * 2.8) * .014 }, fistL: { angle: Math.sin(phase * 3.4) * .016 } } });
    }
  }
  ctx.save();
  if (blinkHidden && !f.previewClean) ctx.globalAlpha *= .065;
  const spriteDrawn = typeof JojoActionSprites !== 'undefined' && JojoActionSprites.draw(ctx, f, phase);
  if (!spriteDrawn) {
    const portraitDrawn = !JojoRig.supports(f.id) && typeof JojoActionSprites !== 'undefined'
      && JojoActionSprites.drawPortrait?.(ctx, f.id, f.x, f.y, height, f.face);
    if (!portraitDrawn) {
      const { pose, mirrorBody } = JojoRig.combatPose(f, phase);
      ctx.save();
      if (mirrorBody) { ctx.translate(f.x * 2, 0); ctx.scale(-1, 1); }
      CharacterArt.articulate(ctx, f.id, f.x, f.y, height, pose);
      ctx.restore();
    }
  }
  ctx.restore();
  if (f.attack && !f.cinematicPose && !f.previewClean && typeof BattleVFX !== 'undefined') {
    const a = f.attack, beat = JojoRig.attackBeat({ ...a, contactTimes: a.contactTimes || rule?.contactTimes });
    if (signature && typeof BattleVFX.drawSignature === 'function') BattleVFX.drawSignature(ctx, f, phase, 'front');
    else if (ranged && a.type !== 'assist' || a.type === 'super') BattleVFX.drawCharge(ctx, f, null, phase);
    else { BattleVFX.drawSlash(ctx, f, {
      slash: beat.strike, strike: beat.strike, pulses: beat.pulses, pulseIndex: beat.pulseIndex,
      wind: beat.wind, motionKey: a.motionKey, kick: false
    }, phase); }
  }
  if (f.guard && !f.previewClean && attack?.type !== 'starCounter') {
    const guardPoint=geometry?geometry.targetPoint(f,-f.face):{x:f.x+f.face*24*size,y:f.y-height*.75};
    ctx.strokeStyle = f.color; ctx.lineWidth = 1.4*size; ctx.globalAlpha = .48;
    ctx.beginPath(); ctx.ellipse(guardPoint.x + f.face*5*size, guardPoint.y, 24*size, 44*size, 0,
      f.face > 0 ? -1.35 : Math.PI - 1.35, f.face > 0 ? 1.35 : Math.PI + 1.35); ctx.stroke();
  }
  if (!f.previewClean && typeof BattleVFX !== 'undefined') BattleVFX.drawStatus?.(ctx, f);
  ctx.restore();
}
