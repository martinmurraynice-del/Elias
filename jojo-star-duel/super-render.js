'use strict';

// A cinematic is sampled from simulation state. Drawing never advances its
// timeline, changes a fighter, or consumes the CPU's random number stream.
const SuperVFX = (() => {
  const TAU = Math.PI * 2;
  const clamp = value => Math.max(0, Math.min(1, value));
  const ease = value => 1 - Math.pow(1 - clamp(value), 3);
  const rgba = (rgb, opacity) => `rgba(${rgb},${clamp(opacity)})`;
  function timelineFor(c) {
    const geometry = typeof CombatGeometry !== 'undefined' ? CombatGeometry : null;
    return c.timeline || geometry?.superTimelineFor?.(c.owner.id) || geometry?.superTimeline
      || fighterCinematicTimeline(c.owner.id, c);
  }
  const palettes = Object.freeze({
    jotaro: Object.freeze({ main: '180,138,255', edge: '163,250,255', word: 'オラ', name: 'STAR PLATINUM', move: '白金之星 · 欧拉连打', call: 'オラオラオラッ！' }),
    dio: Object.freeze({ main: '245,200,91', edge: '221,255,146', word: '無駄', name: 'THE WORLD', move: '世界 · 无駄连打', call: '無駄無駄無駄ッ！' }),
    giorno:{main:'236,163,210',edge:'148,241,135',word:'無駄',name:'GOLD EXPERIENCE',move:'黄金体验 · 生命连打',call:'生命の力'},
    kira:{main:'206,142,224',edge:'255,213,154',word:'爆',name:'KILLER QUEEN',move:'杀手皇后 · 连环爆破',call:'触れて爆破'},
    pucci:{main:'210,211,234',edge:'255,228,134',word:'加速',name:'MADE IN HEAVEN',move:'天堂制造 · 时速连袭',call:'時は加速する'},
    okuyasu:{main:'96,153,255',edge:'181,240,255',word:'削除',name:'THE HAND',move:'轰炸空间 · 三重削除',call:'空間を削り取る'}
  });

  function segment(ctx, x1, y1, x2, y2, color, width) {
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }

  function pressure(ctx, x, y, length, width, colors, opacity) {
    ctx.fillStyle = rgba(colors.main, opacity * .3);
    ctx.beginPath(); ctx.moveTo(x + 7, y); ctx.lineTo(x - 11, y - width);
    ctx.lineTo(x - length, y - width * .2); ctx.lineTo(x - length * .73, y + width * .2);
    ctx.lineTo(x - 11, y + width); ctx.closePath(); ctx.fill();
    segment(ctx, x - length * .76, y, x + 7, y, rgba(colors.edge, opacity * .72), 1.35);
    segment(ctx, x - 19, y, x + 7, y, rgba('255,255,244', opacity), 2.1);
  }

  function shard(ctx, x, y, angle, length, width, color) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(x + dx * length, y + dy * length);
    ctx.lineTo(x - dy * width, y + dx * width);
    ctx.lineTo(x - dx * length * .3, y - dy * length * .3);
    ctx.lineTo(x + dy * width, y - dx * width); ctx.closePath(); ctx.fill();
  }

  // Large, translucent atmosphere sits behind the Stand. Its bright contact
  // core is drawn separately, so decorative energy never implies extra reach.
  function awakening(ctx, c, colors, x, y, height, intensity) {
    const t = c.t, pulse = .5 + .5 * Math.sin(t * 17), radius = height * .54;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = rgba(colors.main, .045 + .02 * intensity);
    ctx.beginPath(); ctx.ellipse(0, 0, radius * .78, radius * 1.12, -.12 * c.dir, 0, TAU); ctx.fill();
    for (let ring = 0; ring < 3; ring++) {
      const a = t * (ring % 2 ? -.9 : .7) + ring * 2.1;
      ctx.strokeStyle = rgba(ring % 2 ? colors.edge : colors.main, (.13 + pulse * .09) / (1 + ring * .3));
      ctx.lineWidth = ring ? 1 : 2;
      ctx.beginPath(); ctx.ellipse(0, 0, radius * (.73 + ring * .13), radius * (1 + ring * .1), -.12 * c.dir, a, a + 3.5); ctx.stroke();
    }
    const count = c.owner.id === 'dio' ? 12 : 8;
    for (let i = 0; i < count; i++) {
      const a = i * TAU / count + (c.owner.id === 'dio' ? -.2 : t * .24);
      const orbit = radius * (1.12 + .08 * Math.sin(t * 5 + i));
      const xx = Math.cos(a) * orbit * .82, yy = Math.sin(a) * orbit;
      if (c.owner.id === 'dio') {
        segment(ctx, xx, yy, xx + Math.cos(a) * (i % 3 ? 5 : 11), yy + Math.sin(a) * (i % 3 ? 5 : 11),
          rgba(colors.edge, .28 + pulse * .16), i % 3 ? 1.1 : 2);
      } else shard(ctx, xx, yy, a + t * .4, 4 + i % 3 * 2, 1.1, rgba(colors.edge, .28 + pulse * .18));
    }
    ctx.restore();
  }

  function finalBurst(ctx, age, radius, colors, blocked) {
    const life = clamp(age / .38), fade = (1 - life) ** 1.5;
    const strength = blocked ? .58 : 1;
    for (let ring = 0; ring < 3; ring++) {
      const p = clamp((age - ring * .045) / .28);
      if (age < ring * .045) continue;
      const r = radius * (.22 + ease(p) * (1.03 + ring * .18));
      ctx.strokeStyle = rgba(ring === 1 ? colors.main : colors.edge, fade * (ring ? .45 : .85) * strength);
      ctx.lineWidth = (ring ? 1.4 : 3.5) * (1 - life * .7);
      ctx.beginPath(); ctx.ellipse(0, 0, r * (.65 + ring * .11), r, -.15 + ring * .22, 0, TAU); ctx.stroke();
    }
    for (let i = 0; i < 16; i++) {
      const a = i * TAU / 16 + .13 * Math.sin(i * 4.7);
      const travel = radius * (.28 + ease(life) * (1.12 + i % 4 * .19));
      const length = (7 + i % 4 * 4) * (1 - life) * strength;
      shard(ctx, Math.cos(a) * travel, Math.sin(a) * travel * .77, a, length, 1.2 + i % 2,
        rgba(i % 3 ? colors.edge : colors.main, fade * .85 * strength));
    }
    // The white flash is confined to the actual knuckle-sized contact zone.
    if (age < .075) {
      const flash = (1 - age / .075) * strength;
      shard(ctx, 0, 0, .2, 28 * flash, 3 * flash, rgba('255,255,245', flash));
      shard(ctx, 0, 0, 1.77, 36 * flash, 2 * flash, rgba('255,255,245', flash));
    }
  }

  function drawWorld(ctx, c, W, H) {
    if (!c || c.interrupted || c.cancelled || c.phase === 'recover') return;
    const colors = palettes[c.owner.id] || palettes.jotaro;
    const timeline = timelineFor(c);
    const geometry = typeof CombatGeometry !== 'undefined' ? CombatGeometry : null;
    const scale = geometry ? geometry.scale(c.owner) : (c.owner.height || 222) / 222;
    const u = clamp(c.progress), dir = c.dir < 0 ? -1 : 1;
    const active = c.phase === 'rush', finishing = c.phase === 'finish';
    const intensity = active ? 1 : finishing ? 1.2 : c.phase === 'approach' ? ease(u) * .7 : .18;
    const opacity = c.phase === 'freeze' ? .18 + u * .36 : 1;
    const height = c.standHeight || (geometry?.rules.super.standHeight || 182) * scale;
    const rushRadius = c.rushRadius || (geometry?.rules.super.rushRadius || 25) * scale;
    const finalRadius = c.finalRadius || (geometry?.rules.super.finalRadius || 76) * scale;
    const contact = geometry ? geometry.targetPoint(c.target, dir)
      : { x: c.target.x - dir * 24 * scale, y: c.target.y - (c.target.height || 222) * .74 };
    const hitX = Number.isFinite(c.impactX) ? c.impactX : c.caught ? contact.x : c.standX;
    const hitY = Number.isFinite(c.impactY) ? c.impactY : c.caught ? contact.y : c.standY;
    const bounds = typeof standContactBounds === 'function' ? standContactBounds(c.owner.id, c.standX, c.standY, height, dir)
      : { left: c.standX - height * .65, right: c.standX + height * .2, top: c.standY - height * .8, bottom: c.standY + height * .2 };
    const bodyX = (bounds.left + bounds.right) / 2, bodyY = (bounds.top + bounds.bottom) / 2;
    ctx.save(); ctx.globalAlpha *= opacity;

    ctx.fillStyle = rgba('5,7,18', .17);
    ctx.beginPath(); ctx.ellipse(bodyX, (c.shadowY ?? 483) + 3 * scale, 30 * scale, 5 * scale, 0, 0, TAU); ctx.fill();
    awakening(ctx, c, colors, bodyX, bodyY, height, intensity);
    if (c.phase === 'approach' && typeof drawStandAtContact === 'function') {
      for (let i = 3; i >= 1; i--) {
        const spread = Math.sin(u * Math.PI);
        drawStandAtContact(ctx, c.owner.id, c.standX - dir * i * 19 * scale * spread,
          c.standY + i * 2 * scale, height, dir, .05 * (4 - i));
      }
    }
    drawStandRush(ctx, c.owner.id, c.standX, c.standY, height,
      { phase: c.phase, progress: u, t: c.t, pulse: c.pulse, timeline,
        impactX: active || finishing ? hitX : c.standX, impactY: active || finishing ? hitY : c.standY }, dir, intensity);

    if (active || finishing) {
      ctx.save(); ctx.translate(hitX, hitY); ctx.scale(dir * scale, scale);
      // Layered air trails approach the saved impact point from behind the
      // actual fist; only the hit event adds a bright spark on contact.
      if ((active || !c.finalHit) && !['kira','okuyasu'].includes(c.owner.id)) {
        const count = active ? 9 : 4;
        for (let i = 0; i < count; i++) {
          const beat = active ? ((c.t - timeline.firstContact) / timeline.beat + i * .217 + 20) % 1
            : clamp(u / (timeline.finalOffset / timeline.phases.finish) - i * .10);
          const travel = ease(beat), lane = Math.sin(i * 2.39) * rushRadius / scale * (active ? .68 : .30);
          const x = -53 + travel * 49;
          const alpha = Math.sin(beat * Math.PI) * (i % 2 ? .46 : .72);
          pressure(ctx, x, lane, (active ? 48 : 64) + (i % 3) * 13,
            active ? 1.5 + i % 2 * .8 : 3.2, colors, alpha);
        }
      }
      if(c.owner.id==='kira'){
        const power=c.finalHit?1.8:1,age=Math.max(0,c.t-c.lastImpact),fade=clamp(1-age/.24);
        for(let i=0;i<3;i++){ctx.strokeStyle=rgba(i%2?colors.edge:colors.main,fade*(.8-i*.16));ctx.lineWidth=3-i*.7;ctx.beginPath();ctx.arc(0,0,(12+age*150+i*9)*power,0,TAU);ctx.stroke();}
        for(let i=0;i<6;i++){const angle=i*TAU/6;shard(ctx,Math.cos(angle)*35*age/.15,Math.sin(angle)*35*age/.15,angle,11*fade,2,rgba(colors.edge,fade));}
      }else if(c.owner.id==='okuyasu'){
        const age=Math.max(0,c.t-c.lastImpact),fade=clamp(1-age/.25),reach=c.finalHit?92:66;
        ctx.fillStyle=rgba('1,3,15',fade);ctx.beginPath();ctx.moveTo(12,-reach);ctx.lineTo(24,0);ctx.lineTo(-10,reach);ctx.lineTo(-25,5);ctx.closePath();ctx.fill();
        segment(ctx,12,-reach,-25,5,rgba(colors.edge,fade),3);segment(ctx,-25,5,-10,reach,rgba(colors.edge,fade),3);
        for(let i=0;i<4;i++)segment(ctx,-125-i*7,(i-1.5)*19,-29,(i-1.5)*4,rgba(colors.main,fade*.55),1.3);
      }else if(c.owner.id==='giorno'){
        for(let i=0;i<3;i++){ctx.strokeStyle=rgba(colors.edge,.35+c.pulse*.25);ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-65+i*13,65);ctx.bezierCurveTo(-20,35,-65,-45,10+i*8,-75);ctx.stroke();}
      }else if(c.owner.id==='pucci'){
        for(let i=0;i<12;i++){const a=i*TAU/12+c.t*3,r=64+i%3*5;segment(ctx,Math.cos(a)*r,Math.sin(a)*r,Math.cos(a)*(r+11),Math.sin(a)*(r+11),rgba(colors.edge,.28+c.pulse*.36),i%3?1:2);}
      }
      const finalAge = c.finalHit && Number.isFinite(c.lastImpact) ? c.t - c.lastImpact : -1;
      if (finalAge >= 0 && finalAge < .38) finalBurst(ctx, finalAge, finalRadius / scale, colors, c.blocked);
      ctx.restore();

      if (active) {
        const contactCycle = (c.t - timeline.starts.rush) / timeline.beat;
        const beat = contactCycle % 1, lane = Math.floor(contactCycle) % 2;
        const textX = bodyX - dir * (10 + lane * 20) * scale;
        const textY = bounds.top - (7 + Math.sin(beat * Math.PI) * 5) * scale;
        ctx.save(); ctx.translate(textX, textY); ctx.rotate((lane ? -.12 : .1) * dir);
        ctx.font = `900 ${24 * scale}px "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = rgba('10,8,20', .8); ctx.fillText(colors.word, 2 * scale, 3 * scale);
        ctx.fillStyle = rgba(colors.edge, .48 + Math.sin(beat * Math.PI) * .32); ctx.fillText(colors.word, 0, 0);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  function cutIn(ctx, c, colors, W, H) {
    // This entire countdown is live combat. A small side card leaves the
    // three-stock HUD (0..170) and the central fighting area unobstructed.
    const clock = timelineFor(c), deadline = clock.starts.rush;
    if (!(c.t < deadline)) return;
    const remaining = Math.max(0, deadline - Math.max(0,c.t));
    const progress = clamp(c.t / Math.max(.001,deadline));
    const entrance = .72 + .28 * ease(c.t / .12), width = Math.min(348, W * .39), height = 66;
    const x = c.dir < 0 ? W - width - 18 : 18, y = 180;
    ctx.save(); ctx.globalAlpha *= entrance;
    ctx.fillStyle = rgba('8,8,20', .72); ctx.fillRect(x, y, width, height);
    segment(ctx, x, y, x + width, y, rgba(colors.main, .82), 1.4);
    segment(ctx, x, y + height, x + width, y + height, rgba(colors.edge, .36), .8);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = '700 13px system-ui, sans-serif'; ctx.fillStyle = '#fff8ed';
    ctx.fillText(colors.move, x + 12, y + 14);
    ctx.font = '800 14px system-ui, sans-serif'; ctx.fillStyle = rgba(colors.edge, .98);
    ctx.fillText('蓄势 · 可打断', x + 12, y + 35);
    ctx.textAlign = 'right'; ctx.font = '800 22px ui-monospace, monospace'; ctx.fillStyle = '#fff8ed';
    ctx.fillText(`${remaining.toFixed(1)}s`, x + width - 12, y + 35);
    ctx.textAlign = 'left'; ctx.font = '500 11px system-ui, sans-serif'; ctx.fillStyle = rgba('238,235,224', .82);
    ctx.fillText('对手可移动 / 可防守', x + 12, y + 53);
    ctx.fillStyle = rgba(colors.main, .20); ctx.fillRect(x, y + height - 2, width, 2);
    ctx.fillStyle = rgba(colors.edge, .90); ctx.fillRect(x, y + height - 2, width * progress, 2);
    ctx.restore();
  }

  function drawOverlay(ctx, c, W, H) {
    if (!c || c.interrupted || c.cancelled || c.phase === 'recover') return;
    const colors = palettes[c.owner.id] || palettes.jotaro;
    if (c.t < timelineFor(c).starts.rush) { cutIn(ctx, c, colors, W, H); return; }
    if (c.phase !== 'rush' && c.phase !== 'finish') return;
    const opacity = clamp(c.t / .08);
    ctx.save(); ctx.globalAlpha *= opacity;
    if (c.phase === 'rush' || c.phase === 'finish') {
      const impact = c.phase === 'finish' && c.finalHit ? clamp(1 - (c.t - c.lastImpact) / .24) : .35;
      // Screen-edge speed accents leave both fighters and the HUD unobstructed.
      for (let side = 0; side < 2; side++) for (let i = 0; i < 7; i++) {
        const beat = (c.t * 5 + i * .19) % 1;
        const y = 191 + i * 47, x = side ? W : 0, inward = side ? -1 : 1;
        const length = 25 + (1 - beat) * (62 + impact * 55);
        segment(ctx, x, y, x + inward * length, y + (H * .58 - y) * .12,
          rgba(i % 2 ? colors.main : colors.edge, (.07 + impact * .14) * (1 - beat)), i % 2 ? 1 : 2);
      }
    }
    ctx.fillStyle = rgba('7,7,16', .91);
    ctx.fillRect(0, H - 50, W, 50);
    const duration = Math.max(.001, c.duration || timelineFor(c).duration);
    const progress = clamp(c.t / duration);
    ctx.fillStyle = rgba(colors.main, .16); ctx.fillRect(0, H - 51, W, 1);
    ctx.fillStyle = rgba(colors.edge, .82); ctx.fillRect(0, H - 51, W * progress, 1.6);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.font = '600 11px system-ui, sans-serif'; ctx.fillStyle = rgba(colors.edge, .76);
    ctx.fillText(c.owner.id==='kira'?'CHAIN BLAST':c.owner.id==='okuyasu'?'SPACE ERASE':c.owner.id==='pucci'?'ACCELERATION':'STAND RUSH', 27, H - 25);
    ctx.font = '700 14px system-ui, sans-serif'; ctx.fillStyle = '#f5f0e4';
    ctx.fillText(colors.move, 137, H - 25);
    const label = c.phase === 'rush' ? (c.blocked ? '防御连击' : '连续击打') : '终结一击';
    ctx.textAlign = 'center'; ctx.font = '500 12px system-ui, sans-serif';
    ctx.fillStyle = rgba('238,235,224', .58); ctx.fillText(label, W * .56, H - 25);
    ctx.textAlign = 'right'; ctx.font = '900 22px system-ui, sans-serif';
    ctx.fillStyle = rgba(colors.edge, .98);
    const count = Math.max(0, Math.floor(c.hits || 0));
    const missed = !c.caught && c.phase === 'finish';
    ctx.fillText(missed ? 'MISS' : `${String(count).padStart(2, '0')}  ${c.blocked ? 'GUARD' : 'HITS'}`, W - 28, H - 25);
    ctx.restore();
  }

  return Object.freeze({ drawWorld, drawOverlay });
})();
