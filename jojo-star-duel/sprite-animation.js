'use strict';

// Generated, authored action frames share a single scale. Measured foot anchors
// may align individual cells without resizing their bodies. Frame selection
// follows the simulation's attack clock, never RAF.
const JojoActionSprites = (() => {
  const assets = new Map();
  const defaults = {
    jotaro: { src: 'assets/jojo/generated/jotaro-actions-v1.png', columns: 4, rows: 4, version: 'v1' },
    dio: { src: 'assets/jojo/generated/dio-actions-v1.png', columns: 4, rows: 4, version: 'v1' }
  };
  const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const smooth = n => { const u = clamp(n, 0, 1); return u * u * (3 - 2 * u); };
  const knockdownDefaults = Object.freeze({ fall: .20, down: .65, rise: .30 });
  // The authored hurt frames already lean backward. Their measured head-to-
  // foot axes need less than a quarter turn when struck from the front.
  const hurtHeadOffsets = Object.freeze({ jotaro: Object.freeze([-65, -201]), dio: Object.freeze([-53, -194]) });
  const moves = Object.freeze([
    Object.freeze({ prepare: 1, contact: 2, recover: 3 }),
    Object.freeze({ prepare: 4, contact: 5, recover: 6 }),
    Object.freeze({ prepare: 7, contact: 8, recover: 9 }),
    Object.freeze({ prepare: 11, contact: 10, recover: 11, second: 12 }),
    Object.freeze({ prepare: 13, contact: 14, recover: 15 })
  ]);

  function attackSample(a) {
    if (!a) return { index: 0, phase: 'ready', contactIndex: -1 };
    const combo = clamp(Math.round(finite(a.combo, 1)), 1, 5), move = moves[combo - 1];
    const startup = Math.max(.025, finite(a.startup, .06)), active = Math.max(.025, finite(a.active, .08));
    const end = startup + active, duration = Math.max(end, finite(a.duration, end + .15));
    const t = clamp(finite(a.t), 0, duration);
    const contacts = (Array.isArray(a.contactTimes) && a.contactTimes.length ? a.contactTimes : [startup])
      .filter(value => Number.isFinite(value) && value >= 0 && value < end).slice(0, 2);
    if (!contacts.length) contacts.push(startup);
    if (t >= duration - 1e-7) return { index: 0, phase: 'ready', contactIndex: -1 };
    // A brief initial ready frame makes a fresh press distinguishable from an
    // attack that is already held. Every contact then has an explicit exposure.
    if (t < Math.min(.008, startup * .12)) return { index: 0, phase: 'prepare', contactIndex: -1 };
    for (let i = contacts.length - 1; i >= 0; i--) {
      const contact = contacts[i], next = contacts[i + 1] ?? end;
      const hold = typeof CombatGeometry !== 'undefined' ? CombatGeometry.contactDuration(a,i)
        : Math.min(.052, Math.max(.024, (next - contact) * .65));
      if (t >= contact && t < contact + hold) {
        return { index: i > 0 && move.second != null ? move.second : move.contact, phase: 'contact', contactIndex: i };
      }
      if (t >= contact) return { index: move.recover, phase: i + 1 < contacts.length ? 'rebound' : 'recover', contactIndex: i };
    }
    return { index: move.prepare, phase: 'prepare', contactIndex: -1 };
  }

  function grounded(f) {
    return typeof f.grounded === 'boolean' ? f.grounded
      : f.supportId != null && Number.isFinite(f.surfaceY) ? Math.abs(f.y - f.surfaceY) <= 2 : f.y >= 481;
  }
  function knockdownPose(f) {
    const kd = f?.knockdown;
    if (f?.burstT > 0 || !kd || !['fall', 'down', 'rise'].includes(kd.phase)) return null;
    const timing = typeof KNOCKDOWN_TIMING !== 'undefined' ? KNOCKDOWN_TIMING : knockdownDefaults;
    const fallDuration = Math.max(.01, finite(timing.fall, knockdownDefaults.fall));
    const riseDuration = Math.max(.01, finite(timing.rise, knockdownDefaults.rise));
    const t = Math.max(0, finite(kd.t)), dir = kd.dir < 0 ? -1 : kd.dir > 0 ? 1 : f.face < 0 ? -1 : 1;
    const facing = f.face < 0 ? -1 : 1, head = hurtHeadOffsets[f.id] || hurtHeadOffsets.jotaro;
    const downAngle = dir * Math.PI * .5 + facing * Math.atan2(Math.abs(head[0]), Math.abs(head[1]));
    let rotation = 1, layers = [{ index: 15, alpha: 1 }];
    if (kd.phase === 'fall') rotation = Math.pow(clamp(t / fallDuration, 0, 1), 1.45);
    if (kd.phase === 'rise') {
      const u = clamp(t / riseDuration, 0, 1);
      rotation = 1 - smooth(u / .80);
      if (u < .20) layers = [{ index: 15, alpha: 1 - smooth(u / .20) }, { index: 13, alpha: smooth(u / .20) }];
      else if (u < .72) layers = [{ index: 13, alpha: 1 }];
      else layers = [{ index: 13, alpha: 1 - smooth((u - .72) / .28) }, { index: 0, alpha: smooth((u - .72) / .28) }];
    }
    layers = layers.map(layer => ({ ...layer, sheet: 'motion', facing,
      angle: downAngle * rotation, fallbackAngle: dir * Math.PI * .5 * rotation }));
    if (assets.get(f.id)?.knockdown?.ready) {
      const prone = alpha => ({ sheet: 'knockdown', index: 0, facing: dir, angle: 0, fallbackAngle: 0, alpha });
      if (kd.phase === 'fall') {
        const reveal = smooth((t / fallDuration - .68) / .32);
        layers = [{ ...layers[0], alpha: 1 - reveal }, prone(reveal)];
      } else if (kd.phase === 'down') layers = [prone(1)];
      else {
        const u = clamp(t / riseDuration, 0, 1);
        // The prone drawing already lies on its side. Only the separate crouch
        // frame tilts while taking over; never rotate the horizontal artwork.
        const kneel = alpha => ({ sheet: 'motion', index: 13, facing, alpha,
          angle: downAngle * .55 * (1 - smooth(u / .72)), fallbackAngle: dir * Math.PI * .275 * (1 - smooth(u / .72)) });
        if (u < .42) {
          const change = smooth(u / .42); layers = [prone(1 - change), kneel(change)];
        } else if (u < .74) layers = [kneel(1)];
        else {
          const change = smooth((u - .74) / .26);
          layers = [kneel(1 - change), { sheet: 'motion', index: 0, facing, angle: 0, fallbackAngle: 0, alpha: change }];
        }
      }
    }
    layers = layers.filter(layer => layer.alpha > 1e-6);
    const primary = layers.reduce((a, b) => a.alpha >= b.alpha ? a : b);
    const y = finite(f.y), surface = finite(f.surfaceY, y);
    // Airborne falls stay at the physical body's moving foot plane. Never snap
    // a falling sprite to a shadow/platform that has not actually been landed.
    const groundY = f.grounded === true && Math.abs(surface - y) <= 3 ? surface : y;
    return { phase: `knockdown-${kd.phase}`, index: primary.index, sheet: primary.sheet, contactIndex: -1,
      facing: primary.facing, dir, angle: primary.angle, fallbackAngle: primary.fallbackAngle, groundY, layers };
  }
  function sample(f, time = 0) {
    const facing = f?.face < 0 ? -1 : 1, clock = finite(f?.motionTime, finite(time));
    const motion = f?.motion || {}, a = f?.attack, cue = f?.cinematicPose;
    const cinema = cue?.role === 'target' && (cue.locked === false || !['rush', 'finish'].includes(cue.phase)) ? null : cue;
    const frame = (index, phase, sheet = 'motion', direction = facing) => ({ sheet, index, phase, contactIndex: -1, facing: direction });
    if (!f) return frame(0, 'ready');
    if (f.burstT > 0) {
      const duration = typeof CombatGeometry !== 'undefined' && CombatGeometry.rules.burst?.poseDuration || .38;
      const progress = clamp(1 - f.burstT / duration, 0, 1);
      if (progress < .20) return frame(14, 'burst-brace');
      if (progress < .50) return frame(4, 'burst-release', 'action');
      if (progress < .79) return frame(14, 'burst-settle');
      return frame(0, 'burst-ready');
    }
    const down = knockdownPose(f);
    if (down) return { sheet: down.sheet, index: down.index, phase: down.phase,
      contactIndex: -1, facing: down.facing, angle: down.angle };
    // The same generated character remains visible through the entire super.
    // Its stand is still rendered separately by the existing cinematic system.
    if (cinema) {
      const phase = cinema.phase, progress = clamp(finite(cinema.progress), 0, 1);
      if (cinema.role === 'target') {
        if (cinema.blocked) return frame(14, 'cinematic-guard');
        return frame(phase === 'freeze' ? 0 : 15, 'cinematic-recoil');
      }
      if (phase === 'freeze') return frame(0, 'cinematic-freeze');
      if (phase === 'approach') return frame(1, 'cinematic-prepare', 'action');
      if (phase === 'rush') return frame(10, 'cinematic-command', 'action');
      if (phase === 'finish') return frame(14, 'cinematic-finish', 'action');
      return progress < .55 ? frame(15, 'cinematic-recover', 'action') : frame(0, 'ready');
    }
    if (f.guard || f.blockStun && f.stun > 0) return frame(14, 'guard');
    if (f.stun > 0) return frame(15, 'hit');
    if (a) {
      const command = typeof CombatGeometry !== 'undefined' && typeof CombatGeometry.commandPose === 'function'
        ? CombatGeometry.commandPose(f, a) : null;
      if (command) return { ...command, facing };
      const specialCombo = { heavy: 5, upper: 2, ranged: 1, assist: 1, super: 5 };
      const cue = attackSample(a.type === 'melee' ? a : { ...a, combo: specialCombo[a.type] || 1 });
      return { sheet: 'action', ...cue, facing };
    }
    // Residual visual blends cannot hide a newly accepted attack/contact.
    if (finite(motion.guard) > .15) return frame(14, 'guard');
    if (finite(motion.impact) > .12) return frame(15, 'hit');
    if (f.dash > 0) {
      const duration = typeof MOVEMENT !== 'undefined' && MOVEMENT.dashDuration || .22;
      const index = f.dash > duration * .80 ? 6 : f.dash > duration * .20 ? 7 : 8;
      return frame(index, index === 6 ? 'dash-prepare' : index === 7 ? 'dash-travel' : 'dash-brake', 'motion', f.dashDir < 0 ? -1 : f.dashDir > 0 ? 1 : facing);
    }
    if (finite(motion.dash) > .12) return frame(8, 'dash-brake', 'motion', f.dashDir < 0 ? -1 : f.dashDir > 0 ? 1 : facing);
    const onGround = grounded(f);
    if (onGround && finite(motion.land) > .10) return frame(13, 'land');
    if (!onGround) {
      if (finite(motion.takeoff) > .78) return frame(9, 'jump-prepare');
      const vy = finite(f.vy);
      return frame(vy < -100 ? 10 : vy > 100 ? 12 : 11, vy < -100 ? 'jump-rise' : vy > 100 ? 'jump-fall' : 'jump-apex');
    }
    const travel = finite(motion.travel, Math.sign(finite(f.vx))), moving = Math.abs(finite(f.vx)) > 14 || finite(motion.move) > .1;
    if (moving) {
      const phase = finite(f.runPhase, clock * 13) * .76, cycle = ((phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const step = Math.floor(cycle / (Math.PI * .5));
      return frame(2 + (travel * facing < 0 ? 3 - step : step), travel * facing < 0 ? 'retreat' : 'run');
    }
    return frame(Math.floor(Math.max(0, clock) / .9) % 2, 'ready');
  }

  function eligible(f) { return !!f && (!!defaults[f.id] || assets.has(f.id)); }

  // Optional background removal only changes connected exterior alpha. It is
  // performed per cell so empty white gutters do not affect enclosed costume.
  function maskExterior(source, rects) {
    const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(source, 0, 0);
    if (typeof connectedExteriorMask !== 'function') return canvas;
    for (const [x, y, w, h] of rects) {
      const pixels = ctx.getImageData(x, y, w, h); connectedExteriorMask(pixels); ctx.putImageData(pixels, x, y);
    }
    return canvas;
  }

  function keyMagenta(imageData) {
    const { width, height, data } = imageData;
    const original = new Uint8ClampedArray(data), background = new Uint8Array(width * height);
    // Pure key pixels are background even in enclosed gaps between limbs.
    // Character colors (skin, olive, gold and black) fail this saturation test.
    for (let i = 0; i < background.length; i++) {
      const p = i * 4, r = original[p], g = original[p + 1], b = original[p + 2];
      if (Math.min(r, b) > 224 && g < 40 && Math.min(r, b) - g > 195) {
        background[i] = 1; data[p + 3] = 0;
      }
    }
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x, p = i * 4;
      if (background[i] || original[p + 3] === 0) continue;
      const r = original[p], g = original[p + 1], b = original[p + 2];
      if (Math.min(r, b) - g <= 20) continue;
      let touchesKey = false, nearest = Infinity, foreground = null;
      for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= width || yy >= height || (!dx && !dy)) continue;
        const ni = yy * width + xx, np = ni * 4, distance = dx * dx + dy * dy;
        if (background[ni] && distance <= 25) touchesKey = true;
        if (distance < nearest && original[np + 3] > 0
          && Math.min(original[np], original[np + 2]) - original[np + 1] <= 15) {
          nearest = distance; foreground = [original[np], original[np + 1], original[np + 2]];
        }
      }
      if (!touchesKey) continue;
      // Recover fractional coverage against the nearest opaque character color.
      // Unmixing RGB removes the magenta fringe instead of leaving a dark halo.
      const f = foreground || [g, g, g], vr = 255 - f[0], vg = -f[1], vb = 255 - f[2];
      const amount = clamp(((r - f[0]) * vr + (g - f[1]) * vg + (b - f[2]) * vb)
        / Math.max(1, vr * vr + vg * vg + vb * vb), 0, 1);
      const coverage = amount < .015 ? 1 : 1 - amount;
      data[p + 3] = Math.round(original[p + 3] * coverage);
      if (coverage < .015) { data[p + 3] = 0; continue; }
      data[p] = clamp(Math.round((r - (1 - coverage) * 255) / coverage), 0, 255);
      data[p + 1] = clamp(Math.round(g / coverage), 0, 255);
      data[p + 2] = clamp(Math.round((b - (1 - coverage) * 255) / coverage), 0, 255);
      // The generated edge sometimes contains a thin opaque purple ink fringe,
      // rather than a mathematically exact background blend. Restrict this
      // final despill to the five-pixel keyed boundary, leaving interior colors.
      const spill = Math.max(0, Math.min(data[p], data[p + 2]) - data[p + 1] - 8);
      data[p] -= spill; data[p + 2] -= spill;
    }
    return imageData;
  }

  function keyedSource(image) {
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, image.width, image.height);
    keyMagenta(pixels); ctx.putImageData(pixels, 0, 0);
    return canvas;
  }

  function convexHull(points) {
    const ordered = points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [], upper = [];
    for (const p of ordered) {
      while (lower.length > 1 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    for (let i = ordered.length - 1; i >= 0; i--) {
      const p = ordered[i];
      while (upper.length > 1 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    lower.pop(); upper.pop();
    return Object.freeze(lower.concat(upper).map(p => Object.freeze(p)));
  }

  function frameHulls(source, rects) {
    let pixels = null;
    try {
      const ctx = source.getContext?.('2d');
      if (typeof ctx?.getImageData === 'function') pixels = ctx.getImageData(0, 0, source.width, source.height);
    } catch (_) { /* A source without readable alpha still has its reviewed crop. */ }
    return Object.freeze(rects.map(([sx, sy, w, h]) => {
      const points = [];
      if (pixels && pixels.data?.length >= pixels.width * pixels.height * 4) {
        for (let y = 0; y < h; y++) {
          let left = w, right = -1;
          for (let x = 0; x < w; x++) if (pixels.data[((sy + y) * pixels.width + sx + x) * 4 + 3] > 16) {
            left = Math.min(left, x); right = x;
          }
          if (right >= left) points.push([left, y], [right + 1, y], [left, y + 1], [right + 1, y + 1]);
        }
      }
      return convexHull(points.length ? points : [[0, 0], [w, 0], [w, h], [0, h]]);
    }));
  }

  // A few generated poses cross the nominal cell gutter. Cache only that
  // pose's connected alpha component so a neighbour's fist/shoe cannot leak in.
  function isolateFrame(source, rect, seed) {
    const [sx, sy, width, height] = rect;
    const pixels = source.getContext('2d').getImageData(sx, sy, width, height);
    const x = Math.round(seed[0] - sx), y = Math.round(seed[1] - sy);
    if (x < 0 || x >= width || y < 0 || y >= height || !pixels.data[(y * width + x) * 4 + 3]) throw new Error('Frame isolation seed must lie inside the authored pose.');
    const visited = new Uint8Array(width * height), queue = new Int32Array(width * height);
    let read = 0, write = 1; queue[0] = y * width + x; visited[queue[0]] = 1;
    while (read < write) {
      const at = queue[read++], cx = at % width, cy = Math.floor(at / width);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy, next = ny * width + nx;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height || visited[next] || !pixels.data[next * 4 + 3]) continue;
        visited[next] = 1; queue[write++] = next;
      }
    }
    for (let i = 0; i < visited.length; i++) if (!visited[i]) pixels.data[i * 4 + 3] = 0;
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    canvas.getContext('2d').putImageData(pixels, 0, 0);
    return canvas;
  }

  async function loadSheet(config) {
    const record = { ready: false, version: config.version || 'v1', src: config.src, error: null };
      try {
        const image = new Image(); image.src = config.src; await image.decode();
        const columns = Math.max(1, Math.round(finite(config.columns, 4))), rows = Math.max(1, Math.round(finite(config.rows, 4)));
        const cellWidth = image.width / columns, cellHeight = image.height / rows;
        const frameCount = config.frameCount ?? 16;
        if (!Number.isInteger(frameCount) || frameCount < 1 || frameCount > 64) throw new Error('An atlas needs between 1 and 64 frames.');
        const rects = config.frameRects || Array.from({ length: frameCount }, (_, i) => [
          Math.round((i % columns) * cellWidth), Math.round(Math.floor(i / columns) * cellHeight),
          Math.round((i % columns + 1) * cellWidth) - Math.round((i % columns) * cellWidth),
          Math.round((Math.floor(i / columns) + 1) * cellHeight) - Math.round(Math.floor(i / columns) * cellHeight)
        ]);
        if (rects.length !== frameCount || rects.some(r => !Array.isArray(r) || r.length !== 4 || r.some(v => !Number.isFinite(v))
          || r[0] < 0 || r[1] < 0 || r[2] <= 0 || r[3] <= 0 || r[0] + r[2] > image.width || r[1] + r[3] > image.height)) {
          throw new Error(`A character atlas must provide ${frameCount} valid source rectangles.`);
        }
        const anchor = config.anchor || [cellWidth * .5, cellHeight * .92];
        const sourceHeight = finite(config.sourceHeight, cellHeight * .84);
        if (!Array.isArray(anchor) || anchor.length !== 2 || anchor.some(v => !Number.isFinite(v)) || sourceHeight <= 0) {
          throw new Error('An action atlas needs a finite common foot anchor and positive source height.');
        }
        const frameAnchors = config.frameAnchors || Array.from({ length: frameCount }, () => anchor);
        if (frameAnchors.length !== frameCount || frameAnchors.some(a => !Array.isArray(a) || a.length !== 2 || a.some(v => !Number.isFinite(v)))) {
          throw new Error(`Per-frame alignment must provide ${frameCount} finite foot anchors.`);
        }
        const source = typeof document === 'undefined' ? image : config.chromaKey === 'magenta' ? keyedSource(image)
          : config.removeExteriorWhite ? maskExterior(image, rects) : image;
        const frameSources = {}, hulls = [...frameHulls(source, rects)];
        if (typeof document !== 'undefined' && source.getContext) for (const [key, seed] of Object.entries(config.frameIsolation || {})) {
          const index = Number(key);
          if (!Number.isInteger(index) || !rects[index] || !Array.isArray(seed) || seed.length !== 2 || seed.some(n => !Number.isFinite(n))) throw new Error('Invalid frame isolation metadata.');
          const isolated = isolateFrame(source, rects[index], seed); frameSources[index] = isolated;
          hulls[index] = frameHulls(isolated, [[0, 0, isolated.width, isolated.height]])[0];
        }
        Object.assign(record, { source, frameSources, rects: rects.map(r => Object.freeze([...r])), anchor: Object.freeze([...anchor]),
          frameAnchors: Object.freeze(frameAnchors.map(a => Object.freeze([...a]))),
          frameHulls: Object.freeze(hulls),
          sourceHeight, width: image.width, height: image.height, ready: true });
      } catch (error) {
        record.error = error?.message || String(error);
      }
    return record;
  }

  async function load(configs = {}) {
    return Promise.all(Object.entries({ ...defaults, ...configs }).map(async ([id, base]) => {
      const config = { ...base, ...(configs[id] || {}) };
      const roster = { action: { ready: false, version: config.version, src: config.src, error: null },
        motion: { ready: false, version: config.motion?.version, src: config.motion?.src, error: config.motion ? null : 'Motion atlas is not configured.' },
        knockdown: { ready: false, version: config.knockdown?.version, src: config.knockdown?.src, error: config.knockdown ? null : 'Prone atlas is not configured.' } };
      assets.set(id, roster);
      await Promise.all([
        loadSheet(config).then(asset => { roster.action = asset; }),
        config.motion ? loadSheet({ columns: 4, rows: 4, chromaKey: config.chromaKey, ...config.motion }).then(asset => { roster.motion = asset; }) : null,
        config.knockdown ? loadSheet({ columns: 1, rows: 1, frameCount: 1, chromaKey: config.chromaKey, ...config.knockdown }).then(asset => { roster.knockdown = asset; }) : null
      ]);
      return status(id);
    }));
  }

  function sheetStatus(asset) {
    return Object.freeze({ ready: !!asset?.ready, version: asset?.version, src: asset?.src, error: asset?.error || null,
      width: asset?.width, height: asset?.height, frames: asset?.rects?.length || 0,
      anchor: asset?.anchor, frameAnchors: asset?.frameAnchors, frameHulls: asset?.frameHulls, sourceHeight: asset?.sourceHeight });
  }
  function status(id) {
    const roster = assets.get(id), action = sheetStatus(roster?.action || defaults[id]), motion = sheetStatus(roster?.motion), knockdown = sheetStatus(roster?.knockdown);
    // Legacy top-level fields describe the attack sheet. Full readiness and
    // per-sheet errors make missing movement assets visible to loading/debug UI.
    return Object.freeze({ ...action, motionReady: motion.ready, fullReady: action.ready && motion.ready, knockdownReady: knockdown.ready,
      sheets: Object.freeze({ action, motion, knockdown }) });
  }

  // Pure rigid geometry, also useful to camera/CPU-only tests without images.
  // hull and anchor are frame-local source pixels; scale is uniform on X/Y.
  function groundedRotation(hull, anchor, scale, facing, angle, x, groundY) {
    const cosine = Math.cos(angle), sine = Math.sin(angle), dir = facing < 0 ? -1 : 1;
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const point of hull) {
      const px = (point[0] - anchor[0]) * scale * dir, py = (point[1] - anchor[1]) * scale;
      const xx = cosine * px - sine * py, yy = sine * px + cosine * py;
      left = Math.min(left, xx); right = Math.max(right, xx); top = Math.min(top, yy); bottom = Math.max(bottom, yy);
    }
    const y = groundY - bottom;
    return { x, y, angle, scale, facing: dir,
      bounds: { left: x + left, right: x + right, top: y + top, bottom: groundY } };
  }

  function knockdownLayout(f) {
    const pose = knockdownPose(f);
    if (!pose) return null;
    const height = finite(f.height, f.id === 'jotaro' ? 221.51 : 223.21), roster = assets.get(f.id);
    const layers = [];
    for (const part of pose.layers) {
      let sheet = part.sheet, index = part.index, asset = roster?.[sheet], facing = part.facing;
      if (!asset?.ready) { sheet = 'action'; index = part.index === 15 ? 15 : 0; asset = roster?.action; }
      let hull, anchor, scale;
      if (asset?.ready) {
        hull = asset.frameHulls[index]; anchor = asset.frameAnchors[index]; scale = height / asset.sourceHeight;
      } else {
        // The legacy body fallback uses the same crop math as its final paint,
        // so missing generated sheets still produce a horizontal grounded body.
        const spec = typeof CharacterArt !== 'undefined' ? CharacterArt.specs[f.id] : null;
        const width = spec?.rect[2] || height * .65, sourceHeight = spec?.rect[3] || height;
        hull = [[0, 0], [width, 0], [width, sourceHeight], [0, sourceHeight]];
        anchor = [spec ? spec.anchorX - spec.rect[0] : width * .5, sourceHeight];
        facing = f.id === 'jotaro' ? -part.facing : part.facing;
        scale = height / sourceHeight; sheet = 'original'; index = 0;
      }
      const angle = sheet === part.sheet ? part.angle : part.fallbackAngle;
      const previous = layers.find(layer => layer.sheet === sheet && layer.index === index && layer.angle === angle && layer.facing === facing);
      if (previous) { previous.alpha += part.alpha; continue; }
      layers.push({ sheet, index, alpha: part.alpha, height,
        ...groundedRotation(hull, anchor, scale, facing, angle, finite(f.x), pose.groundY) });
    }
    return { phase: pose.phase, groundY: pose.groundY, layers,
      bounds: { left: Math.min(...layers.map(layer => layer.bounds.left)), right: Math.max(...layers.map(layer => layer.bounds.right)),
        top: Math.min(...layers.map(layer => layer.bounds.top)), bottom: pose.groundY } };
  }

  function knockdownBounds(f) { return knockdownLayout(f)?.bounds || null; }

  function drawKnockdown(ctx, f) {
    const layout = knockdownLayout(f);
    if (!layout || layout.layers.some(layer => layer.sheet === 'original') && typeof CharacterArt === 'undefined') return false;
    for (const layer of layout.layers) {
      ctx.save(); ctx.globalAlpha *= layer.alpha;
      ctx.translate(layer.x, layer.y); ctx.rotate(layer.angle);
      if (layer.sheet === 'original') {
        ctx.scale(layer.facing, 1); CharacterArt.paint(ctx, f.id, 0, 0, layer.height);
      } else drawFrame(ctx, f.id, layer.sheet, layer.index, 0, 0, layer.height, layer.facing);
      ctx.restore();
    }
    return true;
  }

  function drawFrame(ctx, id, sheet, index, x, y, height, face = 1) {
    const asset = assets.get(id)?.[sheet];
    if (!asset?.ready || !Number.isInteger(index) || index < 0 || index >= asset.rects.length) return false;
    const [sx, sy, sw, sh] = asset.rects[index], anchor = asset.frameAnchors[index], scale = height / asset.sourceHeight;
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.translate(x, y); ctx.scale(face < 0 ? -scale : scale, scale);
    const isolated = asset.frameSources?.[index];
    ctx.drawImage(isolated || asset.source, isolated ? 0 : sx, isolated ? 0 : sy, sw, sh, -anchor[0], -anchor[1], sw, sh);
    ctx.restore();
    return true;
  }

  function drawPortrait(ctx, id, x, y, height, face = 1) {
    return drawFrame(ctx, id, 'motion', 0, x, y, height, face) || drawFrame(ctx, id, 'action', 0, x, y, height, face);
  }

  function draw(ctx, f, time = 0) {
    if (!eligible(f)) return false;
    if (f.knockdown && !(f.burstT > 0)) return drawKnockdown(ctx, f);
    const cue = sample(f, time), height = f.height || (f.id === 'jotaro' ? 221.51 : 223.21);
    if (drawFrame(ctx, f.id, cue.sheet, cue.index, f.x, f.y, height, cue.facing)) return true;
    // If only one downloaded sheet is available, its ready frame keeps the
    // model consistent while the other sheet reports its load error in status.
    return drawPortrait(ctx, f.id, f.x, f.y, height, cue.facing);
  }

  return Object.freeze({ load, sample, eligible, draw, drawFrame, drawPortrait, status, keyMagenta,
    knockdownPose, knockdownLayout, knockdownBounds, groundedRotation, drawKnockdown,
    ready: (id, sheet = 'action') => !!assets.get(id)?.[sheet]?.ready });
})();
