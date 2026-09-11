'use strict';

// Effects use simulation time only: pause and hit-stop keep every pressure
// ribbon in sync with combat. The original character/Stand art is drawn by
// FighterRenderer; this layer adds light and motion without drawing bodies.
// No gameplay state is changed and no per-frame canvas surfaces are allocated.
const BattleVFX = (() => {
  const TAU = Math.PI * 2;
  const clamp = n => Math.max(0, Math.min(1, n));
  const fade = n => Math.pow(1 - clamp(n), 1.5);
  const color = (rgb, a = 1) => `rgba(${rgb},${clamp(a)})`;
  const WHITE = '255,253,240';
  const PALETTES = Object.freeze({
    jotaro: Object.freeze({ main: '170,113,255', edge: '136,241,243', dark: '58,28,105', word: 'オラ' }),
    dio: Object.freeze({ main: '255,211,76', edge: '206,244,114', dark: '93,60,17', word: '無駄' }),
    giorno:{main:'239,173,216',edge:'155,244,152',dark:'53,35,43',word:'無駄'},
    kira:{main:'204,151,229',edge:'252,204,126',dark:'52,25,65',word:'爆'},
    pucci:{main:'213,216,233',edge:'250,223,133',dark:'32,34,65',word:'加速'},
    okuyasu:{main:'108,158,255',edge:'186,239,255',dark:'8,17,54',word:'削除'}
  });
  const BURST_PALETTES = Object.freeze({
    jotaro: Object.freeze({ main: '178,119,255', edge: '236,225,255' }),
    dio: Object.freeze({ main: '255,204,65', edge: '255,239,163' })
  });
  const palette = id => PALETTES[id] || PALETTES.jotaro;
  const geometry = () => typeof CombatGeometry !== 'undefined' ? CombatGeometry : null;
  function strikePoint(f, attack = f.attack, contact = 0) {
    if (geometry() && Number.isFinite(f.x) && Number.isFinite(f.y)) return geometry().strike(f, attack, contact);
    const scale = (f.height || 222) / 222, dir = f.face < 0 ? -1 : 1;
    const x = Number.isFinite(f.x) ? f.x : 0, y = Number.isFinite(f.y) ? f.y : 0;
    const kick = attack?.motionKey === 'kick' || attack?.combo === 3;
    return { x: x + dir * (kick ? 103 : 130) * scale, y: y - 175 * scale,
      startX: x + dir * 26 * scale, startY: y - (kick ? 110 : 167) * scale, scale };
  }
  function eventSize(e) {
    if (Number.isFinite(e.size) && e.size > 0) return e.size;
    const g = geometry();
    if (e.kind === 'super') return e.power >= 3 ? g?.rules.super.finalRadius || 76 : g?.rules.super.rushRadius || 25;
    return g?.profile(e.kind).size || ({ combo1: 9, combo2: 11, combo3: 14, combo4: 10, combo5: 20,
      upper: 16, heavy: 20, ranged: 21, assist: 28 })[e.kind] || 10;
  }

  function glow(ctx, x, y, radius, rgb, strength = .4) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(.01, radius));
    g.addColorStop(0, color(rgb, strength));
    g.addColorStop(.34, color(rgb, strength * .55));
    g.addColorStop(1, color(rgb, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fill();
  }

  function line(ctx, points, stroke, width) {
    ctx.strokeStyle = stroke; ctx.lineWidth = width;
    ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.stroke();
  }

  function ring(ctx, x, y, rx, ry, rotation, from, to, stroke, width) {
    ctx.strokeStyle = stroke; ctx.lineWidth = width;
    ctx.beginPath(); ctx.ellipse(x, y, Math.max(.01, rx), Math.max(.01, ry), rotation, from, to); ctx.stroke();
  }

  function shard(ctx, x, y, size, angle, rgb, alpha) {
    const dx = Math.cos(angle) * size, dy = Math.sin(angle) * size;
    ctx.fillStyle = color(rgb, alpha);
    ctx.beginPath(); ctx.moveTo(x + dx, y + dy);
    ctx.lineTo(x - dy * .28, y + dx * .28); ctx.lineTo(x - dx, y - dy);
    ctx.lineTo(x + dy * .28, y - dx * .28); ctx.closePath(); ctx.fill();
  }

  // A transparent pressure ribbon ends in a needle rather than a ball or blade.
  function ribbon(ctx, length, y, width, bend, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.moveTo(8, y - width);
    ctx.bezierCurveTo(-length * .24, y - width + bend, -length * .67, y - bend, -length, y + bend * .5);
    ctx.bezierCurveTo(-length * .63, y + bend * .35, -length * .2, y + width + bend, 8, y + width);
    ctx.closePath(); ctx.fill();
  }

  // Narrow angular streaks suggest successive blows, without inventing a fist
  // or altering the silhouette/proportions of the supplied original artwork.
  function pressureStreak(ctx, x, y, length, width, colors, alpha = 1) {
    const g = ctx.createLinearGradient(x - length, y, x, y);
    g.addColorStop(0, color(colors.main, 0));
    g.addColorStop(.6, color(colors.main, alpha * .48));
    g.addColorStop(.89, color(colors.edge, alpha * .86));
    g.addColorStop(1, color(WHITE, alpha));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x + width * 1.4, y);
    ctx.lineTo(x - width * 2, y - width);
    ctx.lineTo(x - length, y - width * .22);
    ctx.lineTo(x - length * .56, y + width * .18);
    ctx.lineTo(x - width * 2, y + width); ctx.closePath(); ctx.fill();
    line(ctx, [[x - length * .56, y], [x + width * .72, y]], color(WHITE, alpha * .8), .9);
  }

  function soundLetter(ctx, colors, x, y, dir, size, alpha) {
    ctx.save(); ctx.translate(x, y);
    // The fighter frame is mirrored for left-facing attacks; lettering is not.
    ctx.scale(dir < 0 ? -1 : 1, 1); ctx.rotate(-.12);
    ctx.font = `900 ${size}px "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = color(colors.dark, alpha * .95);
    ctx.fillText(colors.word, 1.5, 1.5);
    ctx.fillStyle = color(colors.edge, alpha);
    ctx.fillText(colors.word, 0, 0);
    ctx.restore();
  }

  function pressure(ctx, r, t, colors, superMove, dir, kind = 'ranged') {
    const tail = r * (superMove ? 6.2 : 7.2);
    glow(ctx, -r * .3, 0, r * 2.1, colors.main, .25);
    for (let i = 0; i < 5; i++) {
      ribbon(ctx, tail * (1 - i * .10), (i - 2) * r * .37, r * (i % 2 ? .065 : .11),
        Math.sin(t * 13 + i * 2.2) * r * .38, color(i % 2 ? colors.edge : colors.main, .36 - i * .045));
    }
    // A small bright tip and two orbiting filaments share the collision point;
    // the long colored wake is decorative and does not imply a larger radius.
    ctx.save(); ctx.scale(.78, .45); star(ctx, r * .82, colors.edge, .82); star(ctx, r * .44, WHITE, .95); ctx.restore();
    // Each advancing streak has its own phase, giving a rush cadence while the
    // actual projectile collision shape and speed remain unchanged.
    const count = superMove ? 7 : 5;
    for (let i = 0; i < count; i++) {
      const phase = (t * (superMove ? 5 : 3.5) + i * .381) % 1;
      const xx = r * (.12 - (1 - phase) * (superMove ? 2.2 : 1.3));
      const yy = Math.sin(i * 2.399) * r * (superMove ? .95 : .5);
      const alpha = (.4 + Math.sin(phase * Math.PI) * .6) * (i % 2 ? .72 : 1);
      pressureStreak(ctx, xx, yy, r * (1.1 + (i % 3) * .5), r * (superMove ? .105 : .13), colors, alpha);
    }
    // Broken oval contours read as displaced air, not a solid magic projectile.
    for (let i = 0; i < 3; i++) {
      const phase = (t * 3 + i / 3) % 1;
      const xx = -phase * r * 1.6;
      const rx = r * (.19 + phase * .16), ry = r * (.62 + phase * .55);
      const alpha = (1 - phase) * .74;
      ring(ctx, xx, 0, rx, ry, -.12, -1.28, .9, color(colors.edge, alpha), 1.5);
      ring(ctx, xx, 0, rx, ry, -.12, 1.9, 4.2, color(colors.main, alpha * .8), 1);
    }
    for (let i = 0; i < 6; i++) {
      const phase = (t * 2.3 + i * .173) % 1;
      const yy = Math.sin(i * 2.6 + .4) * r * (1.15 + phase * .65);
      line(ctx, [[-r - phase * tail, yy], [-r - phase * tail - r * (.2 + phase * .5), yy]],
        color(colors.edge, .62 * (1 - phase)), .9);
      shard(ctx, -r - phase * tail, yy, r * (.10 + (i % 2) * .05), -.2 + i * .12,
        i % 2 ? colors.edge : WHITE, (1 - phase) * .8);
    }
    if (kind === 'dashRanged') {
      for (const side of [-1, 1]) {
        pressureStreak(ctx, -r * .6, side * r * .42, r * 7.8, r * .12, colors, .64);
        ring(ctx, -r * 1.1, 0, r * .4, r * 1.45, 0,
          side < 0 ? -1.25 : 1.85, side < 0 ? 1.25 : 4.4, color(colors.edge, .52), 1.25);
      }
    } else if (kind === 'rangedLow') {
      // Broad, thin wakes stay behind the same small collision core. The low
      // lane comes from castPoint; this drawing never moves the projectile.
      for (let i = 0; i < 3; i++) {
        const phase = (t * 3.2 + i / 3) % 1;
        ring(ctx, -r * (1.4 + phase * 4.7), r * .7, r * (1.2 + phase), r * .22, 0,
          .15, Math.PI - .15, color(i % 2 ? colors.main : colors.edge, .6 * (1 - phase)), 1.1);
      }
    } else if (kind === 'rangedUp') {
      for (const side of [-1, 1]) {
        ctx.strokeStyle = color(colors.edge, .50); ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.moveTo(-r * 5.7, side * r * .8);
        ctx.bezierCurveTo(-r * 4.2, side * r * 1.7, -r * 2, side * r * 1.1, -r * .6, side * r * .35); ctx.stroke();
      }
    }
    if (superMove) {
      const pulse = (t * 4) % 1;
      soundLetter(ctx, colors, -r * (.9 + pulse * .25), -r * 1.38, dir, 17, .66 * (1 - pulse * .35));
    }
  }

  function assist(ctx, p, t) {
    const colors = palette(p.owner?.id), r = p.r;
    glow(ctx, -r, 0, r * 2.3, colors.main, .22);
    for (let i = 0; i < 5; i++) {
      const yy = (i - 2) * r * .48;
      ribbon(ctx, r * (6.7 - i * .5), yy, r * .075,
        Math.sin(t * 10 + i) * r * .42, color(i % 2 ? colors.main : colors.edge, .54 - i * .065));
    }
    for (let i = 0; i < 2; i++) {
      const phase = (t * 2.7 + i * .5) % 1;
      ring(ctx, -phase * r * 3, 0, r * (.26 + phase * .2), r * (1 + phase * .38), -.1,
        -1.24, 1.24, color(colors.edge, (1 - phase) * .55), 1.3);
    }
    pressureStreak(ctx, -r * .12, 0, r * 3.1, r * .15, colors, .92);
    for (let i = 0; i < 5; i++) {
      const phase = (t * 3.6 + i * .21) % 1;
      shard(ctx, -r * (.7 + phase * 5), Math.sin(i * 2.4) * r * (1 + phase),
        r * .13 * (1 - phase), -.2, i % 2 ? colors.main : colors.edge, .8 * (1 - phase));
    }
  }

  function polygon(ctx, radius, count, rotation, stroke, width = 1, fill = null) {
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const a = rotation + i * TAU / count, x = Math.cos(a) * radius, y = Math.sin(a) * radius;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke();
  }

  function clockFace(ctx, radius, phase, alpha, colors) {
    ring(ctx, 0, 0, radius, radius, 0, 0, TAU, color(colors.main, alpha * .65), 1.3);
    ring(ctx, 0, 0, radius * .85, radius * .85, 0, -.7, 4.2, color(colors.edge, alpha * .5), .85);
    for (let i = 0; i < 12; i++) {
      const a = i * TAU / 12 - Math.PI * .5, start = radius * (i % 3 ? .92 : .83);
      line(ctx, [[Math.cos(a) * start, Math.sin(a) * start], [Math.cos(a) * radius, Math.sin(a) * radius]],
        color(i % 3 ? colors.main : WHITE, alpha * .86), i % 3 ? .8 : 1.7);
    }
    for (let i = 0; i < 2; i++) {
      const a = phase * (i ? 1 : 2.4) + i * 1.7 - Math.PI * .5, length = radius * (i ? .55 : .76);
      line(ctx, [[0, 0], [Math.cos(a) * length, Math.sin(a) * length]], color(colors.edge, alpha * .75), i ? 1.9 : 1.1);
    }
  }

  function prismCross(ctx, radius, alpha, rotation = 0) {
    ctx.save(); ctx.rotate(rotation);
    // Four faceted arms make a cross-shaped solid. The colored facets belong
    // to this prism, rather than to the ordinary projectile pressure ribbons.
    for (let i = 0; i < 4; i++) {
      ctx.save(); ctx.rotate(i * Math.PI / 2);
      ctx.fillStyle = color('170,113,255', alpha * .66);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(radius * .22, -radius * .19);
      ctx.lineTo(radius, 0); ctx.lineTo(radius * .20, radius * .18); ctx.closePath(); ctx.fill();
      ctx.fillStyle = color(WHITE, alpha);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(radius * .18, -radius * .07);
      ctx.lineTo(radius * .90, 0); ctx.lineTo(radius * .16, radius * .045); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    polygon(ctx, radius * .24, 4, 0, color('196,231,255', alpha), 1.2, color(WHITE, alpha * .9));
    ctx.restore();
  }

  function reversal(ctx, p, t) {
    const r = p.r, colors = palette('jotaro');
    for (let i = 3; i > 0; i--) {
      ctx.save(); ctx.translate(-r * (i * 1.05 + .5), Math.sin(i * 2 + t * 5) * r * .10);
      prismCross(ctx, r * (1 - i * .12), .22 - i * .045, -.10); ctx.restore();
    }
    for (const side of [-1, 1]) {
      line(ctx, [[-r * 4.5, side * r * .52], [-r * 3.1, side * r * .78], [-r * 2.2, side * r * .34],
        [-r * 1.3, side * r * .6], [-r * .25, side * r * .13]], color(colors.edge, .58), 1.1);
    }
    glow(ctx, 0, 0, r * 1.35, colors.main, .18);
    prismCross(ctx, r, .98, -.10);
    for (let i = 0; i < 5; i++) {
      const u = (t * 2.2 + i * .213) % 1;
      shard(ctx, -r * (1 + u * 4), Math.sin(i * 2.3) * r * (1.2 + u), r * .12, .7 + u,
        i % 2 ? colors.edge : WHITE, (1 - u) * .85);
    }
  }

  function knifeShape(ctx, length, alpha, gold = false) {
    // Tip at x=0 is the actual projectile point. A bevel, cutting edge,
    // crossguard and wrapped dark handle remain readable at the reduced scale.
    ctx.fillStyle = color(gold ? '255,226,136' : '212,223,237', alpha);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-length * .65, -length * .115);
    ctx.lineTo(-length * .69, length * .065); ctx.lineTo(-length * .23, length * .045); ctx.closePath(); ctx.fill();
    ctx.fillStyle = color(gold ? '137,103,50' : '80,100,125', alpha);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-length * .67, 0); ctx.lineTo(-length * .65, -length * .115); ctx.closePath(); ctx.fill();
    line(ctx, [[-length * .64, length * .065], [0, 0]], color(WHITE, alpha), .8);
    line(ctx, [[-length * .7, -length * .18], [-length * .7, length * .16]], color('232,196,108', alpha), 2.5);
    line(ctx, [[-length * .73, 0], [-length, 0]], color('35,37,47', alpha), Math.max(2, length * .14));
    for (let i = 0; i < 3; i++) line(ctx, [[-length * (.78 + i * .075), -length * .06],
      [-length * (.8 + i * .075), length * .06]], color('198,169,98', alpha * .75), .8);
  }

  function knife(ctx, p, t) {
    const colors = palette('dio'), index = Number.isFinite(p.knifeIndex) ? p.knifeIndex : p.index || 0;
    const length = Math.max(18, p.r * 5.8), held = !!p.held;
    if (held) {
      const clock = Number.isFinite(p.hoverAge) ? p.hoverAge : t;
      ctx.save(); ctx.translate(-length * .48, 0);
      clockFace(ctx, length * .82, clock * .8 + index * .7, .45, colors); ctx.restore();
      line(ctx, [[-length * 1.6, -length * .26], [-length * .72, 0], [-length * 1.6, length * .26]],
        color(colors.edge, .35), .75);
    } else {
      for (let i = 2; i > 0; i--) {
        ctx.save(); ctx.translate(-length * i * .64, 0); knifeShape(ctx, length, .23 - i * .07, p.type === 'knifeFinish'); ctx.restore();
      }
      line(ctx, [[-length * 3.5, 0], [-length * .25, 0]], color(colors.edge, .43), 1.1);
      line(ctx, [[-length * 2.8, -length * .15], [-length * 1.15, -length * .15]], color(WHITE, .65), .65);
    }
    knifeShape(ctx, length, 1, p.type === 'knifeFinish');
  }

  function motif(ctx, style, radius, t, colors, alpha = 1) {
    const r=Math.max(1,radius);
    if(style==='plant') {
      line(ctx,[[-r*2,0],[-r,.25*r],[0,0],[r*.5,-r*.25]],color(colors.edge,alpha),1.8);
      for(let i=0;i<4;i++){const x=-r*1.5+i*r*.5,side=i%2?1:-1;ctx.save();ctx.translate(x,0);ctx.rotate(side*(.55+Math.sin(t*5+i)*.08));
        ctx.fillStyle=color(i%2?colors.main:colors.edge,alpha*.8);ctx.beginPath();ctx.ellipse(0,-side*r*.35,r*.45,r*.15,side*.4,0,TAU);ctx.fill();ctx.restore();}
      ring(ctx,0,0,r*.7,r*.7,t,0,TAU,color(WHITE,alpha*.55),1);
    } else if(style==='bomb') {
      ctx.fillStyle=color(colors.dark,alpha);ctx.strokeStyle=color(colors.edge,alpha);ctx.lineWidth=1.5;
      ctx.beginPath();ctx.ellipse(0,0,r*.86,r*.68,0,0,TAU);ctx.fill();ctx.stroke();
      for(const side of [-1,1]){ring(ctx,side*r*.45,-r*.08,r*.15,r*.19,0,0,TAU,color(WHITE,alpha),1.5);ring(ctx,side*r*.54,r*.65,r*.22,r*.22,t*3,0,TAU,color(colors.main,alpha),2);}
      line(ctx,[[-r*.25,r*.33],[0,r*.42],[r*.25,r*.33]],color(colors.edge,alpha),1.6);
      for(let i=0;i<3;i++)ring(ctx,0,0,r*(1.1+i*.22),r*(1.1+i*.22),t+i,0,.9,color(colors.main,alpha*(.6-i*.12)),1);
    } else if(style==='gravity') {
      for(let i=0;i<4;i++){const phase=(t*1.8+i/4)%1;ring(ctx,0,0,r*(.25+phase*1.8),r*(.2+phase*.6),t*.8,0,TAU,color(i%2?colors.edge:colors.main,alpha*(1-phase)),1.3);}
      star(ctx,r*.40,WHITE,alpha*.7);
    } else if(style==='speed') {
      for(let i=-2;i<=2;i++)pressureStreak(ctx,i%2?-r*.7:0,i*r*.22,r*(3.5+Math.abs(i)),Math.max(.55,r*.075),colors,alpha*(.9-Math.abs(i)*.18));
      ring(ctx,0,0,r*.45,r,t,-1.2,1.2,color(WHITE,alpha),1.1);
    } else if(style==='space') {
      ctx.fillStyle=color('2,3,16',alpha);ctx.beginPath();ctx.moveTo(0,-r*1.7);ctx.lineTo(r*.45,-r*.15);ctx.lineTo(-r*.08,r*1.65);ctx.lineTo(-r*.4,r*.15);ctx.closePath();ctx.fill();
      line(ctx,[[0,-r*1.7],[-r*.4,r*.15],[-r*.08,r*1.65]],color(colors.edge,alpha),2.2);
      for(const side of [-1,1])line(ctx,[[side*r*1.8,-r*.6],[side*r*.8,-r*.2],[side*r*.45,0]],color(colors.main,alpha*.65),1.1);
    }
  }
  function drawPullSignature(ctx,f,a,layer,p,g) {
    const area=g.pullArea(f,a);if(!area)return false;
    const t=Math.max(0,a.t||0),start=a.startup??p.startup;
    const active=a.active??p.active,end=a.duration??start+active+p.recovery;
    if(t>=end)return true;
    const buildup=clamp(t/Math.max(.01,start));
    const after=clamp((t-start-active)/Math.min(.22,p.recovery));
    const alpha=(t<start?.14+.48*buildup:1)*(1-after);
    const s=area.scale,length=area.length/s,r=area.radius/s,colors=palette(f.id);
    const gravity=p.style==='gravity',contact=clamp(1-Math.abs(t-start)/.11);
    ctx.save();ctx.translate(area.startX,area.startY);ctx.scale(area.dir*s,s);
    ctx.globalAlpha*=alpha;ctx.lineCap='round';ctx.lineJoin='round';
    if(layer==='back') {
      // Thin boundary rails and end caps expose the full capturable corridor;
      // none of the decorative light extends its height or far-end radius.
      for(const side of [-1,1])line(ctx,[[0,side*r],[length,side*r]],color(colors.edge,.18+.18*buildup),.8);
      ring(ctx,0,0,r,r,0,Math.PI/2,Math.PI*1.5,color(colors.main,.30),1);
      ring(ctx,length,0,r,r,0,-Math.PI/2,Math.PI/2,color(colors.edge,.4),1);
      if(gravity) {
        for(let i=0;i<7;i++) {
          const x=length*(i+.5)/7,phase=t*7+i*.7;
          ring(ctx,x,0,r*.19,r*(.62+.14*Math.sin(phase)),0,0,TAU,
            color(i%2?colors.edge:colors.main,.28+i*.025),1.1);
        }
      } else {
        ctx.fillStyle=color('2,3,16',.40);ctx.beginPath();ctx.moveTo(0,0);
        for(let i=1;i<=8;i++)ctx.lineTo(length*i/8,-r*(i%2?.30:.13));
        for(let i=8;i>=1;i--)ctx.lineTo(length*i/8,r*(i%2?.13:.30));
        ctx.closePath();ctx.fill();
        for(const side of [-1,1]){
          const points=[[0,0]];for(let i=1;i<=8;i++)points.push([length*i/8,side*r*(i%2?.30:.13)]);
          line(ctx,points,color(colors.edge,.46),1.3);
        }
      }
    } else {
      // Repeating marks travel back toward the hand; the visible flow explains
      // the pull direction even when the opponent is near the caster.
      for(let i=0;i<9;i++) {
        const cycle=(t*(gravity?2.4:3.1)+i/9)%1,x=length*(1-cycle);
        const offset=Math.sin(i*2.4+t*4)*r*.62;
        const tail=Math.min(length,x+length*.055),head=Math.max(0,x-length*.026);
        if(gravity)line(ctx,[[tail,offset],[x,offset*.82],[head,offset*.7]],
          color(i%3?colors.edge:WHITE,.40+contact*.35),i%3?1.15:1.7);
        else line(ctx,[[tail,offset-r*.11],[x,offset],[tail,offset+r*.11]],
          color(i%2?colors.edge:WHITE,.54+contact*.26),1.2);
      }
      if(contact>0) {
        line(ctx,[[0,0],[length,0]],color(WHITE,contact*.58),gravity?1.2:2.1);
        for(const at of [0,length])ring(ctx,at,0,r*.55,r*.84,0,-Math.PI/2,Math.PI/2,
          color(colors.edge,contact*.75),1.8);
      }
      if(!gravity)for(let i=0;i<5;i++){
        const x=length*(i+1)/6,tilt=Math.sin(t*12+i)*r*.10;
        line(ctx,[[x-r*.12,-r*.73],[x+tilt,0],[x+r*.12,r*.73]],color(colors.main,.45),1.1);
      }
    }
    ctx.restore();return true;
  }
  function drawExpandedSignature(ctx,f,a,layer) {
    const g=geometry(),p=g?.profile(a.type);if(!p?.style)return false;
    if(p.pullCapture&&g.pullArea)return drawPullSignature(ctx,f,a,layer,p,g);
    const s=g.scale(f),dir=f.face<0?-1:1,t=a.t||0,colors=palette(f.id),start=a.startup||p.startup;
    const duration=a.duration||start+p.active+p.recovery,alpha=clamp((duration-t)/.16);
    const contacts=a.contactTimes||p.contactTimes||[start];let index=0;
    for(let i=0;i<contacts.length;i++)if(t>=contacts[i])index=i;
    const point=g.strike(f,a,index),x=(point.x-f.x)*dir/s,y=(point.y-f.y)/s;
    ctx.save();ctx.translate(f.x,f.y);ctx.scale(dir*s,s);ctx.globalAlpha*=alpha;
    if(layer==='back') {
      if(p.style==='plant'&&p.melee){const growth=clamp(t/start);for(let i=0;i<3;i++){const xx=x*(.55+i*.23);ctx.strokeStyle=color(i%2?colors.main:colors.edge,.60);ctx.lineWidth=i===1?5:2.5;ctx.beginPath();ctx.moveTo(xx,0);ctx.bezierCurveTo(xx-28,-45*growth,xx+25,y*growth*.6,xx+(i-1)*13,y*growth);ctx.stroke();}}
      else if(p.style==='space')for(let i=0;i<3;i++)ring(ctx,70,-130,25+i*20,52+i*8,-.15,-1.2,1.1,color(colors.edge,.22),1.1);
      else if(p.style==='gravity')for(let i=0;i<4;i++)ring(ctx,x*.55,-105,65+i*18,18+i*5,t*.7+i*.14,0,TAU,color(colors.edge,.17),1.2);
      else if(p.style==='speed'){const trail=Math.min(180,(a.chargeTravel||0)/s);for(let i=0;i<5;i++)line(ctx,[[-trail,-70-i*22],[55,-80-i*20]],color(colors.edge,.17+i*.025),1.5);}
      else if(p.style==='bomb')ring(ctx,55,-145,31,31,-t,0,TAU,color(colors.edge,.36),1.4);
    } else {
      const pulse=Math.max(0,...contacts.map(at=>1-Math.abs(t-at)/.10));
      if(t<start){ctx.save();ctx.translate(55,-144);motif(ctx,p.style,11+7*clamp(t/start),t,colors,.4);ctx.restore();}
      if(pulse>0){ctx.save();ctx.translate(x,y);motif(ctx,p.style,p.radius||18,t,colors,pulse);ctx.restore();
        if(p.style==='space'||p.style==='speed')line(ctx,[[30,-145],[x,y]],color(colors.edge,pulse*.65),p.style==='space'?3:1.4);}
    }
    ctx.restore();return true;
  }
  function drawStatus(ctx,f) {
    if(f.hp<=0)return;
    const s=geometry()?.scale(f)||(f.height||222)/222;
    if(f.rootT>0&&!f.knockdown){ctx.save();ctx.translate(f.x,f.y-14*s);ctx.scale(s,s);const c=palette('giorno');for(let i=0;i<3;i++)ring(ctx,0,-i*14,23-i*3,7,(f.motionTime||0)*.1,0,TAU,color(c.edge,.7),2);ctx.restore();}
    if(f.bombMark){ctx.save();ctx.translate(f.x,f.y-f.height*.70);ctx.scale(s,s);motif(ctx,'bomb',10,f.motionTime||0,palette('kira'),.85);ctx.font='700 10px sans-serif';ctx.fillStyle='#fff';ctx.fillText(String(f.bombMark.count-f.bombMark.index),12,-10);ctx.restore();}
  }

  function drawProjectile(ctx, p, time = 0) {
    const t = Number.isFinite(p.age) ? p.age : time;
    const dir = p.vx < 0 ? -1 : 1;
    const angle = Math.atan2(Number.isFinite(p.vy) ? p.vy : 0, Math.abs(Number.isFinite(p.vx) ? p.vx : 1));
    // Mirror first, then rotate in that local frame: a leftward rising shot
    // still rises, and the horizontal lettering keeps its original treatment.
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(dir, 1); ctx.rotate(angle);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const style=geometry()?.profile(p.type).style;
    if(style)motif(ctx,style,p.r,t,palette(p.owner?.id));
    else if (p.type === 'starReversal') reversal(ctx, p, t);
    else if (p.type === 'knife' || p.type === 'knifeFinish') knife(ctx, p, t);
    else if (p.type === 'assist') assist(ctx, p, t);
    else pressure(ctx, p.r, t, palette(p.owner?.id), p.type === 'super', dir, p.type);
    ctx.restore();
  }

  function star(ctx, radius, rgb, intensity) {
    ctx.fillStyle = color(rgb, intensity);
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * TAU - .18;
      const r = radius * (i % 2 ? .16 : (i % 4 ? .62 : 1));
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath(); ctx.fill();
  }

  const normalStrike = kind => ['melee', 'upper', 'heavy', 'combo1', 'combo2', 'combo3', 'combo4', 'combo5'].includes(kind);

  function contactSpark(ctx, e, size) {
    const colors = palette(e.ownerId), heavy = e.kind === 'combo5' || e.kind === 'heavy';
    const kick = e.kind === 'combo3', double = e.kind === 'combo4';
    const age = Math.max(0, e.age || 0), lifetime = Math.max(.08, e.duration || (heavy ? .34 : .24));
    const u = clamp(age / lifetime);
    if (u >= 1) return;
    const out = 1 - (1 - u) ** 3, alpha = (1 - u) ** 1.5;
    const core = (1 - clamp(age / (heavy ? .095 : .065))) ** 1.6;
    ctx.save();
    ctx.rotate(e.kind === 'upper' ? -.65 : e.kind === 'combo2' ? -.2 : kick ? -.08 : .08);
    // Fast white contact remains small; only the transparent outer filaments
    // and drifting fragments survive into the longer event afterglow.
    glow(ctx, 0, 0, size * (heavy ? 2.3 : 1.8), colors.main, alpha * (heavy ? .26 : .19));
    if (core > 0) {
      star(ctx, size * (heavy ? 1.05 : .82), colors.main, core * .84);
      ctx.save(); ctx.rotate(.26); star(ctx, size * .66, colors.edge, core * .98); ctx.restore();
      star(ctx, size * .32, WHITE, core);
      line(ctx, [[-size * .75, 0], [size * .82, 0]], color(WHITE, core * .85), heavy ? 2.1 : 1.4);
    }
    const radius = size * (.38 + out * (heavy ? 2.05 : 1.55));
    ring(ctx, 0, 0, radius * (kick ? 1.25 : 1), radius * (kick ? .38 : .8), -.12,
      -.85 + out * .25, 1.35 + out * .7, color(colors.edge, alpha * .78), heavy ? 1.8 : 1.25);
    ring(ctx, 0, 0, radius * .85, radius * .66, .18,
      2.05 - out * .2, 4.4 + out * .45, color(colors.main, alpha * .67), heavy ? 1.45 : .95);
    if (heavy) {
      const delayed = clamp((age - .035) / Math.max(.1, lifetime - .035));
      if (age >= .035) ring(ctx, -size * .1, 0, size * (.65 + delayed * 2.2), size * (.34 + delayed * 1.2), -.22,
        -.7, 2.7, color(colors.edge, (1 - delayed) ** 1.7 * .44), 1.1);
    }
    if (double) for (const sign of [-1, 1]) {
      const reach = size * (.45 + out * 1.65);
      line(ctx, [[-reach, -reach * .45 * sign], [reach * .85, reach * .38 * sign]],
        color(sign > 0 ? colors.edge : colors.main, alpha * .53), 1.1);
    }
    const count = heavy ? 12 : kick ? 10 : 8;
    for (let i = 0; i < count; i++) {
      const angle = -1.48 + i * 3.02 / (count - 1) + Math.sin(i * 2.7) * .12;
      const distance = size * (.48 + out * (1.2 + (i % 3) * .42));
      const length = size * (heavy ? .44 : .32) * (1 - u) * (1 + i % 2 * .3);
      const x = Math.cos(angle) * distance, y = Math.sin(angle) * distance + u * u * (i % 3) * 7;
      line(ctx, [[x - Math.cos(angle) * length * 1.5, y - Math.sin(angle) * length * 1.5], [x, y]],
        color(colors.main, alpha * .4), heavy ? 1.2 : .85);
      shard(ctx, x, y, Math.max(.15, length * .55), angle + u * (i % 2 ? .7 : -.7),
        i % 3 ? colors.edge : WHITE, alpha * (i % 2 ? .75 : .94));
    }
    ctx.restore();
  }

  function impact(ctx, e, u, size) {
    if (normalStrike(e.kind)) { contactSpark(ctx, e, size); return; }
    const colors = palette(e.ownerId);
    // The cinematic owns the final expanding outline. Its event adds only the
    // short contact core, so two full-size shockwaves never cover the body.
    if (e.kind === 'super' && e.power >= 3) {
      const contact = clamp((e.age || 0) / .14), alpha = (1 - contact) ** 2;
      const core = Number.isFinite(e.size) ? size : size * .33;
      glow(ctx, 0, 0, core * 1.7, colors.main, fade(u) * .24);
      star(ctx, core * (.82 + contact * .27), colors.edge, alpha * .9);
      star(ctx, core * .40, WHITE, alpha);
      for (let i = 0; i < 8; i++) {
        const angle = i * TAU / 8 + .15, reach = core * (.35 + Math.sqrt(u) * 1.3);
        shard(ctx, Math.cos(angle) * reach, Math.sin(angle) * reach, core * .16 * (1 - u), angle,
          i % 2 ? colors.edge : WHITE, fade(u) * .83);
      }
      return;
    }
    const out = 1 - Math.pow(1 - u, 3), alpha = fade(u);
    glow(ctx, 0, 0, size * (.8 + out * .7), colors.main, alpha * .26);
    ring(ctx, 0, 0, size * (.2 + out * 1.35), size * (.2 + out * 1.15), -.12, -.7, 2.15,
      color(colors.edge, alpha * .78), 1.8 * (1 - u) + .5);
    ring(ctx, 0, 0, size * (.15 + out * 1.05), size * (.15 + out * .7), .2, 2.4, 5.4,
      color(colors.main, alpha * .72), 1.15);
    if (u < .5) {
      ctx.save(); ctx.rotate(-.13);
      star(ctx, size * (.8 + out * .15), colors.main, clamp(1 - u * 2) * .85);
      star(ctx, size * (.55 + out * .12), colors.edge, clamp(1 - u * 2.2));
      star(ctx, size * .27, WHITE, clamp(1 - u * 3));
      ctx.restore();
    }
    const count = e.power >= 2 ? 12 : 8;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * TAU + Math.sin(i * 4.7) * .15;
      const distance = size * (.2 + out * (.95 + (i % 3) * .20));
      const length = size * (.12 + (i % 3) * .04) * (1 - u);
      ctx.save(); ctx.rotate(angle); ctx.translate(distance, 0);
      ctx.fillStyle = color(i % 3 ? colors.edge : WHITE, alpha);
      ctx.beginPath(); ctx.moveTo(length, 0); ctx.lineTo(-length * .6, 1.2 + size * .025);
      ctx.lineTo(-length * .2, 0); ctx.lineTo(-length * .8, -1.2 - size * .025); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  function cast(ctx, e, u, size) {
    const colors = palette(e.ownerId), out = 1 - Math.pow(1 - u, 2), alpha = fade(u);
    glow(ctx, 0, 0, size * .9, colors.main, alpha * .25);
    for (let i = 0; i < 2; i++) {
      ring(ctx, -u * size * .65 - i * 8, 0, size * (.17 + out * .13), size * (.3 + out * .75 + i * .2),
        -.17, 0, TAU, color(i ? colors.main : colors.edge, alpha * (i ? .4 : .8)), i ? 1 : 2.4);
    }
    for (let i = 0; i < 5; i++) {
      const yy = (i - 2) * size * .22;
      pressureStreak(ctx, size * out * .25, yy, size * (.6 + out * 1.4), (1 - u) * (i === 2 ? 2.3 : 1), colors, alpha * .7);
    }
  }

  function signatureEvent(ctx, e, u, size) {
    const kind = e.kind, colors = palette(e.ownerId), alpha = fade(u), out = Math.sqrt(u);
    const style=geometry()?.profile(kind).style;
    if(style){
      if(e.type==='detonate'||(style==='bomb'&&e.type==='impact')){for(let i=0;i<3;i++)ring(ctx,0,0,size*(.2+out*(1+i*.22)),size*(.2+out*(1+i*.22)),0,0,TAU,color(i%2?colors.edge:colors.main,alpha*(1-i*.15)),3-i*.7);star(ctx,size*(1-u),WHITE,alpha*.7);}
      else motif(ctx,style,size*(.65+out*.5),e.age||0,colors,alpha);
      return true;
    }
    if (kind === 'starCounter' && e.type === 'impact') {
      // The physical charge owns this contact; no shield or detached wave.
      const core = (1 - clamp((e.age || 0) / .14)) ** 1.35;
      prismCross(ctx, size * (1.20 + out * .95), core, 0);
      for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI / 2, reach = size * (.45 + out * 2.5);
        const dx = Math.cos(angle), dy = Math.sin(angle);
        line(ctx, [[dx * size * .35, dy * size * .35], [dx * reach, dy * reach]], color(colors.edge, alpha * .85), 1.5);
        shard(ctx, dx * reach, dy * reach, size * .25 * (1 - u), angle, WHITE, alpha);
        const fine = angle + .37 + u * .65;
        line(ctx, [[Math.cos(fine) * size * .55, Math.sin(fine) * size * .55],
          [Math.cos(fine) * reach * .82, Math.sin(fine) * reach * .82]], color(colors.main, alpha * .55), .75);
      }
      return true;
    }
    if (e.type === 'parry' || kind === 'starReversal') {
      const r = size * (.8 + out * 1.25);
      if (kind === 'starReversal') prismCross(ctx, size * (1 + out * .55), (1 - clamp(u * 2.3)) ** 1.3, Math.PI / 4);
      polygon(ctx, r, 6, -.15, color(colors.edge, alpha * .75), 1.4);
      for (let i = 0; i < 6; i++) {
        const angle = i * TAU / 6 - .15, reach = r * (1.1 + u * .4);
        ctx.save(); ctx.translate(Math.cos(angle) * reach, Math.sin(angle) * reach);
        polygon(ctx, size * .20 * (1 - u), 6, angle + u * 2, color(WHITE, alpha), .8, color(colors.main, alpha * .52)); ctx.restore();
        line(ctx, [[Math.cos(angle) * r * .65, Math.sin(angle) * r * .65], [Math.cos(angle) * reach, Math.sin(angle) * reach]],
          color(colors.edge, alpha * .6), 1.1);
      }
      return true;
    }
    if (kind === 'starAscend' || kind === 'starAscendFinish') {
      const core = (1 - clamp((e.age || 0) / .11)) ** 1.5;
      for (let i = 0; i < 2; i++) ring(ctx, 0, -i * 10 - out * 5, size * (.55 + out * 1.7 + i * .2),
        size * (.20 + out * .28), -.10, i ? .15 : Math.PI + .15, i ? Math.PI - .1 : TAU - .1,
        color(i ? WHITE : colors.main, alpha * .85), i ? 1.3 : 2.3);
      line(ctx, [[-4, size], [2, size * .2], [-2, -size * .3], [3, -size * 1.8], [0, -size * 2.7]],
        color(WHITE, core), 2.2);
      for (let i = 0; i < 7; i++) shard(ctx, Math.sin(i * 2.4) * size * out,
        -size * (.2 + out * (1 + i * .35)), (2.3 + i % 2) * (1 - u), -Math.PI / 2,
        i % 2 ? colors.edge : WHITE, alpha * .9);
      return true;
    }
    if (kind === 'timeAmbush' || kind === 'timeAmbushFinish') {
      const blink = e.type === 'blinkOut' || e.type === 'blinkIn';
      if (blink) {
        ctx.save(); ctx.translate(0, -90);
        clockFace(ctx, size * (1.1 + out * .8), e.type === 'blinkOut' ? .8 : 2, alpha, colors);
        line(ctx, [[-size * .2, -size * 1.7], [size * .12, -size * .15], [-size * .1, size * 1.7]],
          color('9,8,20', alpha), 5);
        line(ctx, [[-size * .2 + 2, -size * 1.7], [size * .12 + 2, -size * .15], [-size * .1 + 2, size * 1.7]],
          color(colors.main, alpha * .8), 1.2); ctx.restore();
      } else {
        for (const side of [-1, 1]) {
          const r = size * (.7 + out * 1.8), slope = side * .7;
          line(ctx, [[-r, -r * slope], [r, r * slope]], color('9,8,20', alpha * .9), 5);
          line(ctx, [[-r, -r * slope - 1.5], [r, r * slope - 1.5]], color(side < 0 ? colors.edge : WHITE, alpha), 1.6);
        }
        for (let i = 0; i < 5; i++) shard(ctx, Math.cos(i * 2.5) * size * out * 1.8,
          Math.sin(i * 2.5) * size * out * 1.8, 3 * (1 - u), i * .7, colors.main, alpha);
      }
      return true;
    }
    if (kind === 'knife' || kind === 'knifeFinish' || kind === 'knifeArray') {
      if (kind === 'knifeArray' || e.type === 'cast') clockFace(ctx, size * (.6 + out), u * .6, alpha * .8, colors);
      else {
        const finish = kind === 'knifeFinish', length = size * (1.1 + out * (finish ? 2.6 : 1.9));
        for (const side of finish ? [-1, 1] : [1]) {
          line(ctx, [[-length, -length * .65 * side], [length * .8, length * .52 * side]], color('13,12,22', alpha), 3);
          line(ctx, [[-length, -length * .65 * side - 1], [length * .8, length * .52 * side - 1]], color(WHITE, alpha), 1.25);
        }
        for (let i = 0; i < (finish ? 7 : 4); i++) {
          const angle = -.9 + i * .39, reach = size * out * (1.2 + i % 3 * .4);
          shard(ctx, Math.cos(angle) * reach, Math.sin(angle) * reach, (2 + i % 2) * (1 - u), angle,
            i % 2 ? colors.main : '225,233,244', alpha);
        }
      }
      return true;
    }
    return false;
  }

  function burst(ctx, e, u, scale) {
    // The event radius is already world-scaled. The caller's transform applies
    // scale once; every ring, spike and fragment stays inside this boundary.
    const rule = geometry()?.rules.burst;
    const radius = Number.isFinite(e.radius) && e.radius > 0 ? e.radius / scale : rule?.radius || 300;
    const colors = BURST_PALETTES[e.ownerId] || palette(e.ownerId), age = Math.max(0, e.age || 0), alpha = fade(u);
    const core = (1 - clamp(age / .10)) ** 1.7;
    if (core > 0) {
      glow(ctx, 0, 0, Math.min(43, radius * .16), colors.main, core * .56);
      glow(ctx, 0, 0, Math.min(21, radius * .08), WHITE, core * .86);
    }
    // Concentric round shock fronts, without the four-point silhouette of the
    // charge or the horizontal fists of a Stand rush.
    for (let i = 0; i < 3; i++) {
      const local = age - i * .035;
      if (local < 0) continue;
      const advance = 1 - (1 - clamp(local / (.27 + i * .07))) ** 3;
      const r = Math.max(.1, (radius - 3) * (.09 + advance * (.91 - i * .055)));
      const opacity = alpha * (i === 0 ? .84 : i === 1 ? .52 : .32);
      ring(ctx, 0, 0, r, r, 0, 0, TAU, color(i === 1 ? colors.main : colors.edge, opacity), i === 0 ? 2.8 : 1.25);
    }
    for (let i = 0; i < 12; i++) {
      const angle = i * TAU / 12 + Math.PI / 12, directionX = Math.cos(angle), directionY = Math.sin(angle);
      const advance = 1 - (1 - clamp(age / .28)) ** 2;
      const tip = radius * (.12 + advance * .78), length = radius * (.13 + (i % 3) * .024) * (1 - clamp(age / .30));
      const width = radius * .009 * (1 - clamp(age / .35));
      if (length > .01) {
        const inner = Math.max(0, tip - length);
        ctx.fillStyle = color(i % 3 ? colors.main : WHITE, alpha * .67);
        ctx.beginPath(); ctx.moveTo(directionX * tip, directionY * tip);
        ctx.lineTo(directionX * inner - directionY * width, directionY * inner + directionX * width);
        ctx.lineTo(directionX * inner + directionY * width, directionY * inner - directionX * width); ctx.closePath(); ctx.fill();
        line(ctx, [[directionX * inner, directionY * inner], [directionX * tip, directionY * tip]], color(colors.edge, alpha * .78), 1.1);
      }
      const shardAt = radius * (.14 + Math.sqrt(u) * .76);
      shard(ctx, directionX * shardAt, directionY * shardAt, radius * .017 * (1 - u), angle,
        i % 2 ? colors.edge : WHITE, alpha * .76);
    }
    // Rising short air traces live within the circular reach, not a tall aura
    // that could suggest a second attack above the actual burst.
    for (let i = 0; i < 7; i++) {
      const phase = clamp((age - i * .019) / .54), x = (i - 3) * radius * .105;
      if (age < i * .019 || phase >= 1) continue;
      const y = radius * .12 - phase * radius * .76, trail = radius * .12 * Math.sin(phase * Math.PI);
      const opacity = Math.sin(phase * Math.PI) * alpha * .62;
      line(ctx, [[x - radius * .018, y + trail], [x + Math.sin(i * 1.8) * radius * .025, y], [x, y - trail * .28]],
        color(i % 2 ? colors.main : colors.edge, opacity), i % 2 ? 1.1 : 1.7);
      shard(ctx, x, y - trail * .3, radius * .013 * (1 - phase), -Math.PI / 2, WHITE, opacity);
    }
  }

  function drawEvent(ctx, e) {
    const u = clamp(e.age / Math.max(.001, e.duration));
    if (u >= 1) return;
    const size = eventSize(e), scale = Number.isFinite(e.scale) && e.scale > 0 ? e.scale : 1;
    const alpha = fade(u), colors = palette(e.ownerId);
    ctx.save(); ctx.translate(e.x, e.y); ctx.scale((e.dir < 0 ? -1 : 1) * scale, scale);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (e.type === 'burst') { burst(ctx, e, u, scale); ctx.restore(); return; }
    if (e.type !== 'block' && signatureEvent(ctx, e, u, size)) { ctx.restore(); return; }
    if (e.type === 'impact') impact(ctx, e, u, size);
    else if (e.type === 'cast') cast(ctx, e, u, size);
    else if (e.type === 'block') {
      if (normalStrike(e.kind)) {
        const blockAge = clamp((e.age || 0) / .11), blockAlpha = (1 - blockAge) ** 2;
        ctx.scale(size / 10, size / 10);
        if (blockAge < 1) {
          ring(ctx, 0, 0, 8 + blockAge * 5, 15 + blockAge * 5, 0, -1.2, 1.2,
            color(colors.edge, blockAlpha * .62), 1.3);
          line(ctx, [[3, -5], [11 + blockAge * 6, -10]], color(WHITE, blockAlpha * .65), 1);
          line(ctx, [[3, 5], [11 + blockAge * 6, 10]], color(WHITE, blockAlpha * .65), 1);
        }
        ctx.restore(); return;
      }
      const guardSize = Math.min(32, size);
      glow(ctx, 0, 0, guardSize, colors.main, alpha * .15);
      for (let i = 0; i < 2; i++) ring(ctx, -i * 3, 0, guardSize * (.3 + u * .35 + i * .1), guardSize * (.65 + u * .28),
        0, -1.31, 1.31, color(i ? colors.edge : WHITE, alpha * (1 - i * .23)), i ? 1.2 : 2.8);
      for (let i = 0; i < 4; i++) {
        const yy = (i - 1.5) * (9 + u * 19), xx = 7 + u * 24;
        line(ctx, [[xx, yy], [xx + 7 * (1 - u), yy * 1.2]], color(WHITE, alpha), 1.5);
      }
    } else if (e.type === 'assist') {
      glow(ctx, -size * .3, 0, size * 1.6, colors.main, alpha * .15);
      // Open rising traces surround the original Stand art rendered elsewhere.
      const r = size * (.55 + u * .9);
      ring(ctx, 0, 0, r, r * .33, 0, 0, TAU, color(colors.edge, alpha * .75), 1.8);
      ring(ctx, 0, 0, r * .78, r * .25, 0, 0, TAU, color(colors.main, alpha * .55), 1);
      for (let i = 0; i < 7; i++) {
        const xx = (i - 3) * size * .22, rise = (1 - Math.pow(1 - u, 2)) * size * (1 + (i % 3) * .22);
        line(ctx, [[xx, -rise], [xx + Math.sin(i * 2) * 4, -rise - 18 * (1 - u)]],
          color(i % 2 ? colors.main : colors.edge, alpha * .62), i % 2 ? 1.2 : 1.8);
      }
    } else if (e.type === 'dash') {
      const spread = 1 - (1 - u) ** 3, core = (1 - clamp((e.age || 0) / .075)) ** 2;
      // This aperture remains at the dash departure point. The moving fighter
      // owns the trailing sprite echoes, so no render-time history is needed.
      ctx.save(); ctx.translate(0, -87);
      glow(ctx, 0, 0, 49, colors.main, alpha * .21);
      ring(ctx, -spread * 8, 0, 4 + spread * 24, 66 + spread * 18, -.1,
        -1.35, 1.35, color(colors.edge, alpha * .78), 1.8);
      ring(ctx, -8 - spread * 9, 0, 6 + spread * 18, 60 + spread * 20, .06,
        1.75, 4.4, color(colors.main, alpha * .72), 1.4);
      line(ctx, [[0, -62], [0, 62]], color(WHITE, core * .85), 2.4);
      for (let i = 0; i < 9; i++) {
        const lane = (i - 4) * 17, xx = -12 - spread * (27 + i % 3 * 25);
        const yy = lane + Math.sin(i * 2.3) * spread * 13;
        line(ctx, [[xx - 27 * (1 - u), yy], [xx, yy]], color(i % 2 ? colors.main : colors.edge, alpha * .51), 1.1);
        shard(ctx, xx, yy, (2.2 + i % 3) * (1 - u), -.2 + i * .12,
          i % 3 ? colors.edge : WHITE, alpha * .85);
      }
      ctx.restore();
      ring(ctx, -spread * 12, 7, 14 + spread * 51, 2 + spread * 7, -.04,
        0, TAU, color(colors.edge, alpha * .52), 1.25);
    } else if (e.type === 'land') {
      const spread = Math.sqrt(u);
      ring(ctx, 0, 0, 9 + spread * 43, 2 + spread * 7, 0,
        0, TAU, color(colors.edge, alpha * .46), 1.6);
      ring(ctx, 0, 1, 6 + spread * 34, 2 + spread * 4, 0,
        -.4, 3.8, color(colors.main, alpha * .35), 1);
      for (let i = 0; i < 5; i++) {
        const direction = i % 2 ? -1 : 1;
        const xx = direction * (10 + spread * (19 + i * 13));
        const yy = -Math.sin(u * Math.PI) * (6 + (i % 3) * 7);
        ctx.fillStyle = color('196,181,145', alpha * .17);
        ctx.beginPath(); ctx.ellipse(xx, yy, 4 + spread * (3 + i), 2 + spread * 3, -.2, 0, TAU); ctx.fill();
        shard(ctx, xx * .8, yy - 2, 1.6 * (1 - u), -.4 * direction, colors.edge, alpha * .47);
      }
    }
    ctx.restore();
  }

  function drawDash(ctx, f, time = 0) {
    const g = geometry(), a = f.attack, rule = g?.profile('dashRanged');
    const start = rule?.dashStart ?? .04, end = rule?.dashEnd ?? .20, release = a?.startup ?? .25;
    const command = a?.type === 'dashRanged' && a.t >= start && a.t < release;
    if ((!command && (!(f.dash > 0) || a)) || f.stun > 0 || f.cinematicPose || f.previewClean) return;
    const colors = palette(f.id), scale = g ? g.scale(f) : (f.height || 222) / 222;
    const dir = command ? (f.face < 0 ? -1 : 1) : f.dashDir < 0 ? -1 : f.dashDir > 0 ? 1 : f.face < 0 ? -1 : 1;
    const t = Number.isFinite(f.motionTime) ? f.motionTime : time;
    const movement = typeof MOVEMENT !== 'undefined' ? MOVEMENT : null, duration = movement?.dashDuration || .22;
    const elapsed = Math.max(0, duration - f.dash);
    const strength = command ? clamp((a.t - start) / .025) * clamp((release - a.t) / Math.max(.01, release - end))
      : clamp(elapsed / (duration * .20)) * clamp(f.dash / (duration * .20));
    const travel = command ? clamp((a.t - start) / Math.max(.01, end - start)) : clamp(elapsed / duration);
    const actualDistance = command ? Math.max(0, Math.min(a.t, end) - start) * (rule?.dashSpeed || 650)
      : (f.dashOrigin ? Math.hypot(f.x - f.dashOrigin.x, f.y - f.dashOrigin.y) : elapsed * (movement?.dashSpeed || 1000)) / scale;
    const height = (f.height || 222) / scale;
    ctx.save(); ctx.translate(f.x, f.y); ctx.scale(dir * scale, scale);
    ctx.globalAlpha *= strength;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < 3; i++) {
      const yy = -height * (.28 + i * .22), length = Math.min(actualDistance, 64 + travel * 75 + i * 10);
      ctx.save(); ctx.translate(-12 - i * 4, yy);
      ribbon(ctx, length, 0, i === 1 ? 1.8 : 1.2, Math.sin(t * 15 + i * 2.3) * 7,
        color(i % 2 ? colors.edge : colors.main, .27));
      pressureStreak(ctx, -10, i % 2 ? -4 : 4, length * .76, 1.05, colors, .52);
      ctx.restore();
    }
    for (let i = 0; i < 6; i++) {
      const phase = (travel * 1.7 + i * .173) % 1;
      const x = -Math.min(actualDistance, 24 + phase * 130), y = -height * (.2 + i * .115) + Math.sin(i * 2.1) * 5;
      shard(ctx, x, y, (2.5 - phase) * .8, -.08, i % 2 ? colors.edge : WHITE, (1 - phase) * .66);
    }
    ctx.restore();
  }

  function drawCharge(ctx, f, hand = null, t = 0) {
    const a = f.attack;
    if (!a || !['ranged', 'dashRanged', 'rangedUp', 'rangedLow', 'super'].includes(a.type)) return;
    const g = geometry(), dash = a.type === 'dashRanged', low = a.type === 'rangedLow';
    const rule = g?.profile(a.type), chargeStart = dash ? rule?.dashEnd ?? .20 : 0;
    if (a.t < chargeStart) return;
    const startup = a.startup || .08;
    const buildup = clamp((a.t - chargeStart) / Math.max(.01, startup - chargeStart));
    const release = 1 - clamp((a.t - startup) / Math.max(.05, a.active || .08));
    if (release <= 0) return;
    const large = a.type === 'super', colors = palette(f.id);
    const point = g && Number.isFinite(f.x) && Number.isFinite(f.y) ? g.castPoint(f, a.type)
      : Number.isFinite(f.x) && Number.isFinite(f.y) ? strikePoint(f, { type: 'melee', combo: 1 })
      : { x: hand?.[0] || 0, y: hand?.[1] || 0, scale: 1 };
    const r = (large ? 21 : rule?.radius || 12) * (.3 + buildup * .7), scale = point.scale || 1;
    ctx.save(); ctx.translate(point.x, point.y); ctx.scale((f.face < 0 ? -1 : 1) * scale, scale);
    if (a.type === 'rangedUp') ctx.rotate(rule?.angle ?? -Math.PI / 5);
    ctx.globalAlpha *= (.45 + buildup * .55) * release;
    glow(ctx, -r * .15, 0, r * 2.2, colors.main, large ? .29 : .22);
    star(ctx, r * .32, colors.edge, buildup * .62);
    star(ctx, r * .14, WHITE, buildup * .8);
    // Air converges at the strike point. The open center leaves the hand/art
    // readable and never becomes the previous spherical charge effect.
    for (let i = 0; i < (large ? 8 : 6); i++) {
      const angle = i * 2.399 + t * (i % 2 ? .8 : -.8);
      const cycle = (a.t * 7 + i * .23) % 1;
      const distance = r * (.7 + (1 - cycle) * 1.8), length = 4 + (1 - cycle) * 9;
      line(ctx, [[Math.cos(angle) * distance, Math.sin(angle) * distance],
        [Math.cos(angle) * (distance + length), Math.sin(angle) * (distance + length)]],
        color(i % 2 ? colors.edge : WHITE, (.3 + cycle * .7) * .8), i % 2 ? 1.2 : 1.8);
      shard(ctx, Math.cos(angle) * distance, Math.sin(angle) * distance,
        1.2 + buildup * .7, angle, colors.edge, .38 + cycle * .5);
    }
    for (let i = 0; i < 3; i++) {
      const phase = t * 7 + i * Math.PI;
      ring(ctx, -r * .25, 0, r * (low ? 1.05 + i * .3 : .4 + i * .12), r * (low ? .55 + i * .12 : 1.15 + i * .24), -.18 + i * .17,
        phase, phase + 1.9, color(i % 2 ? colors.main : colors.edge, .78), 1.2);
    }
    if (large) pressureStreak(ctx, r * .6, r * .05, r * 2, r * .065, colors, buildup * .65);
    if (dash) {
      pressureStreak(ctx, -r * .15, 0, r * (3 + buildup * 3), r * .16, colors, buildup * release);
      for (const side of [-1, 1]) pressureStreak(ctx, -r, side * r * .6, r * 3.8, r * .07, colors, buildup * .55);
    }
    ctx.restore();
  }

  function drawSignature(ctx, f, time = 0, layer = 'front') {
    const a = f.attack;
    if(a&&!f.previewClean&&!f.cinematicPose&&geometry()?.profile(a.type).style)return drawExpandedSignature(ctx,f,a,layer);
    if (!a || !['starAscend', 'starCounter', 'timeAmbush', 'knifeArray'].includes(a.type) || f.previewClean || f.cinematicPose) return false;
    const g = geometry(), size = g ? g.scale(f) : (f.height || 222) / 222, dir = f.face < 0 ? -1 : 1;
    const t = Number.isFinite(a.t) ? a.t : 0, colors = palette(f.id), height = (f.height || 222) / size;
    const rule = g?.profile(a.type);
    const duration = a.duration || (rule && rule.startup + rule.active + rule.recovery)
      || ({starAscend:.86,starCounter:.90,timeAmbush:.72,knifeArray:1.16})[a.type];
    const fadeOut = clamp((duration - t) / .14), back = layer === 'back';
    const point = g ? g.castPoint(f, a.type) : { x: f.x + dir * 100 * size, y: f.y - 140 * size };
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalAlpha *= fadeOut;
    if (a.type === 'starAscend') {
      if (back) {
        const tips = [0, 1, 2].map(i => g ? g.strike(f, a, i) : strikePoint(f, a, i));
        const high = tips[2], columnHeight = Math.max(height * 1.38, (f.y - high.y) / size + 28);
        const baseX = (tips[0].startX - f.x) * dir / size, topX = (high.x - f.x) * dir / size;
        const width = Math.max(36, (high.radius || 20 * size) / size * 2.1);
        const strength = clamp(t / .10);
        ctx.translate(f.x, f.y); ctx.scale(dir * size, size);
        for (let strand = 0; strand < 2; strand++) {
          const phase = t * 12 + strand * Math.PI;
          for (let pass = 0; pass < 2; pass++) {
            ctx.strokeStyle = color(pass ? WHITE : colors.main, strength * (pass ? .56 : .32));
            ctx.lineWidth = pass ? .85 : 3.3; ctx.beginPath();
            for (let i = 0; i <= 30; i++) {
              const u = i / 30, angle = u * Math.PI * 5 + phase;
              const x = baseX + (topX - baseX) * u + Math.sin(angle) * (width * .60 + u * width * .55), y = -8 - u * columnHeight;
              i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
            }
            ctx.stroke();
          }
        }
        for (let i = 0; i < 7; i++) {
          const u = (t * 1.25 + i / 7) % 1;
          shard(ctx, baseX + (topX - baseX) * u + Math.sin(i * 2.4 + t * 3) * width, -u * columnHeight, 2.3, -Math.PI / 2,
            i % 2 ? WHITE : colors.edge, Math.sin(u * Math.PI) * .7);
        }
      } else {
        const contacts = (a.contactTimes || rule?.contactTimes || [.16, .28, .42]).slice(0, 3);
        for (let i = 0; i < contacts.length; i++) {
          const age = t - contacts[i];
          if (age < 0 || age >= .23) continue;
          const p = g ? g.strike(f, a, i) : { x: f.x + dir * (125 + i * 10) * size, y: f.y - (155 + i * 35) * size };
          const u = age / .23, r = 18 + Math.sqrt(u) * (i === 2 ? 65 : 48), alpha = fade(u);
          ctx.save(); ctx.translate(p.x, p.y); ctx.scale(dir * size, size);
          ring(ctx, 0, 0, r, 6 + u * 13, -.08, 0, TAU, color(i === 2 ? WHITE : colors.edge, alpha * .82), i === 2 ? 2.2 : 1.4);
          line(ctx, [[-3, 15], [2, -8], [-2, -27], [1, -66 - i * 10]], color(WHITE, alpha), i === 2 ? 2.2 : 1.2);
          ctx.restore();
        }
      }
    } else if (a.type === 'starCounter') {
      const start = rule?.chargeStart ?? a.startup ?? .16, end = rule?.chargeEnd ?? start + (a.active || .32);
      const stop = Number.isFinite(a.chargeStoppedAt) ? a.chargeStoppedAt : end;
      const contact = g ? g.strike(f, a) : point, buildup = clamp(t / Math.max(.01, start));
      const chargeFade = 1 - clamp((t - stop) / .12), source = a.chargeOrigin || f;
      if (chargeFade > 0) {
        if (back && t >= start) {
          const dx = f.x - source.x, dy = f.y - source.y, distance = Math.hypot(dx, dy);
          const fraction = Math.min(1, 150 * size / Math.max(.01, distance));
          for (let i = 0; i < 3; i++) {
            const lane = (i - 1) * 10 * size, x = contact.x - dx * fraction, y = contact.y - dy * fraction + lane;
            line(ctx, [[x, y], [contact.x - dx * fraction * .35, contact.y - dy * fraction * .35 + lane * .55],
              [contact.x, contact.y]], color(i === 1 ? WHITE : colors.main, chargeFade * (i === 1 ? .62 : .35)), (i === 1 ? 1.5 : 2.2) * size);
          }
          for (let i = 3; i > 0 && distance > .1; i--) {
            const at = Math.min(1, (i * 27 + 10) * size / distance);
            ctx.save(); ctx.translate(contact.x - dx * at, contact.y - dy * at); ctx.scale(dir * size, size);
            prismCross(ctx, 24 - i * 3, chargeFade * (.16 - i * .03), 0); ctx.restore();
          }
        } else if (!back) {
          ctx.translate(contact.x, contact.y); ctx.scale(dir * size, size);
          const moving = t >= start, radius = moving ? 29 : 5 + buildup * 13;
          prismCross(ctx, radius, chargeFade * (moving ? .94 : .42 + buildup * .35), 0);
          for (let i = 0; i < 4; i++) {
            const angle = i * Math.PI / 2 + t * 3.8 + .35, outer = moving ? radius * 1.38 : 38 - buildup * 15;
            line(ctx, [[Math.cos(angle) * radius * .40, Math.sin(angle) * radius * .40],
              [Math.cos(angle) * outer, Math.sin(angle) * outer]], color(colors.edge, chargeFade * .68), .85);
          }
        }
      }
    } else if (a.type === 'timeAmbush') {
      const blinkTime = rule?.blinkAt ?? .18;
      const source = a.blinkOrigin || f, target = a.blinkTarget || f;
      if (back) {
        const alpha = t < blinkTime ? clamp(t / .10) : 1 - clamp((t - blinkTime) / .27);
        if (alpha > 0) {
          ctx.save(); ctx.translate(source.x, source.y - height * .5 * size); ctx.scale(size, size);
          clockFace(ctx, 69, Math.min(t, blinkTime) * 4, alpha * .75, colors); ctx.restore();
        }
        if (a.blinkOrigin && t < blinkTime + .24) {
          const cut = 1 - clamp((t - blinkTime) / .24), sy = source.y - height * .48 * size, ty = target.y - height * .48 * size;
          line(ctx, [[source.x, sy], [(source.x + target.x) * .5, (sy + ty) * .5 - 3 * size], [target.x, ty]], color('6,6,17', cut * .93), 7 * size);
          line(ctx, [[source.x, sy - 2 * size], [target.x, ty - 2 * size]], color(colors.main, cut * .85), 1.2 * size);
        }
      } else {
        for (const [i, contact] of (a.contactTimes || rule?.contactTimes || [blinkTime + .10, blinkTime + .20]).slice(0, 2).entries()) {
          const age = t - contact;
          if (age < -.015 || age > .16) continue;
          const p = g ? g.strike(f, a, i) : point, u = clamp(age / .16), alpha = age < 0 ? clamp((age + .015) / .015) : fade(u);
          const reach = (i ? 62 : 47) * size, angle = i ? .63 : -.72;
          const dx = Math.cos(angle) * reach * dir, dy = Math.sin(angle) * reach;
          line(ctx, [[p.x - dx, p.y - dy], [p.x, p.y], [p.x + dx * .6, p.y + dy * .6]], color('7,6,17', alpha), 5 * size);
          line(ctx, [[p.x - dx, p.y - dy - size], [p.x, p.y - size], [p.x + dx * .6, p.y + dy * .6 - size]],
            color(i ? WHITE : colors.edge, alpha), 1.5 * size);
        }
      }
    } else if (a.type === 'knifeArray') {
      if (back) {
        const releaseStart = rule?.releaseStart ?? .48, releaseGap = rule?.releaseGap ?? .10;
        const count = Math.max(1, Math.min(5, rule?.count ?? 5));
        ctx.translate(point.x - dir * 20 * size, point.y); ctx.scale(dir * size, size);
        clockFace(ctx, 72, Math.min(t, releaseStart) * 2, .52 * clamp(t / .12), colors);
        // Fine clock needles mark the five ordered release lanes; actual
        // metal knives are independently drawn from the real projectile list.
        for (let i = 0; i < count; i++) {
          const release = releaseStart + i * releaseGap, held = t < release, angle = -.70 + i * .35;
          if (t > release + .12) continue;
          const alpha = held ? .30 : (1 - (t - release) / .12) * .8;
          line(ctx, [[0, 0], [Math.cos(angle) * 83, Math.sin(angle) * 83]], color(i === count - 1 ? WHITE : colors.main, alpha), .8);
        }
      }
    }
    ctx.restore(); return true;
  }

  function drawCommandSlash(ctx, f, a) {
    const upper = a.type === 'upper', startup = a.startup || (upper ? .12 : .14), age = (a.t || 0) - startup;
    const lead = startup * .48, lifetime = upper ? .13 : .15;
    if (age < -lead || age >= lifetime) return;
    const advance = clamp((age + lead) / lead), sweep = advance * advance * (3 - 2 * advance);
    const alpha = age < 0 ? sweep * .66 : (1 - age / lifetime) ** 1.5;
    if (alpha <= .001) return;
    const point = strikePoint(f, a), scale = point.scale || 1, dir = f.face < 0 ? -1 : 1;
    const dx = (point.x - point.startX) * dir / scale, dy = (point.y - point.startY) / scale;
    const colors = palette(f.id), control1 = upper ? [dx * .80, -8] : [dx * .32, -19];
    const control2 = upper ? [dx + 16, dy * .46] : [dx * .74, dy - 12];
    const curve = u => {
      const v = 1 - u;
      return [3 * v * v * u * control1[0] + 3 * v * u * u * control2[0] + u ** 3 * dx,
        3 * v * v * u * control1[1] + 3 * v * u * u * control2[1] + u ** 3 * dy];
    };
    ctx.save(); ctx.translate(point.startX, point.startY); ctx.scale(dir * scale, scale);
    ctx.globalAlpha *= alpha; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // Open arcs grow from the shared start towards the exact shared tip. A
    // fixed tessellation keeps both the trail and its particles deterministic.
    for (let layer = 0; layer < 3; layer++) {
      const offset = (layer - 1) * (upper ? 4 : 5);
      ctx.strokeStyle = color(layer === 1 ? colors.edge : colors.main, layer === 1 ? .88 : .46);
      ctx.lineWidth = layer === 1 ? 2.6 : 1.2; ctx.beginPath();
      for (let i = 0; i <= 12; i++) {
        const u = sweep * i / 12, [x, y] = curve(u), bend = Math.sin(u * Math.PI) * offset;
        i ? ctx.lineTo(x + (upper ? bend : 0), y + (upper ? 0 : bend)) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 5; i++) {
      const u = sweep * (.28 + i * .145), [x, y] = curve(u);
      const angle = upper ? -1.25 + u * -.35 : .02;
      shard(ctx, x, y, upper ? 2 : 2.5, angle, i % 2 ? colors.edge : WHITE, .8 - i * .07);
    }
    if (age >= 0) {
      ctx.translate(dx, dy); ctx.rotate(upper ? -1.06 : .02);
      pressureStreak(ctx, -2, 0, upper ? 35 : 47, upper ? 1.9 : 2.5, colors, .92);
      ring(ctx, 0, 0, upper ? 6 : 8, upper ? 12 : 16, 0, -1.2, 1.2, color(colors.edge, .72), 1.2);
    }
    ctx.restore();
  }

  function drawSlash(ctx, f, p, t = 0) {
    if (f.attack && ['upper', 'heavy'].includes(f.attack.type)) { drawCommandSlash(ctx, f, f.attack); return; }
    if (!f.attack || p.slash <= .005) return;
    const a = f.attack, colors = palette(f.id);
    const combo = a.type === 'melee' ? Math.max(1, Math.min(5, a.combo || 1)) : 0;
    const heavy = a.type === 'heavy' || combo === 5;
    const kick = a.motionKey === 'kick' || p.motionKey === 'kick' || combo === 3;
    ctx.save(); ctx.globalAlpha *= p.slash * .82;
    const startup = Number.isFinite(a.startup) ? a.startup : .08;
    const attackTime = Number.isFinite(a.t) ? a.t : startup;
    const contacts = (a.contactTimes || (combo === 4 ? [startup, startup + .11] : [startup])).slice(0, 2);
    // Short traces follow the fist/foot near contact, ahead of the body. The
    // first three moves read through their poses, without a torso-sized aura.
    for (let index = 0; index < contacts.length; index++) {
      const age = attackTime - contacts[index];
      const lifetime = heavy ? .105 : .08;
      if (age < -.008 || age >= lifetime) continue;
      const pulse = age < 0 ? clamp((age + .008) / .008) : (1 - age / lifetime) ** 1.7;
      const point = strikePoint(f, a, index), scale = point.scale || 1;
      ctx.save(); ctx.globalAlpha *= pulse;
      // The tip is the same world point used by contact detection. Orient the
      // short trace along the actual limb, including the raised side kick.
      ctx.translate(point.x, point.y);
      ctx.rotate(Math.atan2(point.y - point.startY, point.x - point.startX));
      ctx.scale(scale, scale);
      const length = heavy ? 69 : kick ? 56 : 42;
      const width = heavy ? 2.7 : 1.65;
      pressureStreak(ctx, -width * 1.4, 0, length, width, colors, heavy ? .98 : .86);
      for (const sign of [-1, 1]) {
        const lift = (heavy ? 12 : kick ? 9 : 6) * sign;
        const gradient = ctx.createLinearGradient(-length, lift, 0, 0);
        gradient.addColorStop(0, color(colors.main, 0)); gradient.addColorStop(.55, color(colors.main, .55));
        gradient.addColorStop(1, color(colors.edge, .72));
        ctx.strokeStyle = gradient; ctx.lineWidth = heavy ? 1.5 : 1;
        ctx.beginPath(); ctx.moveTo(-length, lift * 1.3);
        ctx.bezierCurveTo(-length * .66, lift * 1.65, -length * .25, lift, -2, sign * 2); ctx.stroke();
      }
      ring(ctx, 0, 0, heavy ? 8 : 5, heavy ? 20 : kick ? 14 : 10, -.08,
        -1.2, 1.2, color(colors.edge, heavy ? .65 : .43), heavy ? 1.3 : .9);
      for (let i = 0; i < (heavy ? 5 : 3); i++) {
        const x = -length * (.2 + i * .145), y = Math.sin(i * 2.3 + index) * (heavy ? 10 : 6);
        shard(ctx, x, y, heavy ? 2.2 : 1.5, -.08, i % 2 ? colors.main : colors.edge, .7);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  return Object.freeze({ drawProjectile, drawEvent, drawCharge, drawSlash, drawDash, drawSignature, drawStatus });
})();
