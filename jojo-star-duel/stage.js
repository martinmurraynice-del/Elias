/* Selectable arenas. Collision, scenery and camera share immutable map geometry. */
const Stage = (() => {
  const floor = 483, footRadius = 12;
  let width = 3600, ceiling = -820, currentId = 'cairo';
  let spawnPoints = Object.freeze([1590, 2010]);
  // Wide roofs leave a large central fighting floor and equal routes up either
  // side. Outer 160px rises take one jump; inner 220px and high 230px climbs
  // use the air jump. The inner terraces leave 620px of clear central floor.
  let platforms = Object.freeze([
    { id: 'west-roof', x: 160, y: 323, w: 420 },
    { id: 'west-balcony', x: 800, y: 93, w: 480 },
    { id: 'west-terrace', x: 1150, y: 263, w: 340 },
    { id: 'clock-roof', x: 1510, y: -137, w: 580 },
    { id: 'east-terrace', x: 2110, y: 263, w: 340 },
    { id: 'east-balcony', x: 2320, y: 93, w: 480 },
    { id: 'east-roof', x: 3020, y: 323, w: 420 }
  ].map(Object.freeze));
  const define = (name, subtitle, w, sky, spawns, rows) => Object.freeze({ name, subtitle, width:w, ceiling:sky,
    spawnPoints:Object.freeze(spawns), platforms:Object.freeze(rows.map(([id,x,y,w,kind]) => Object.freeze({id,x,y,w,kind}))) });
  const maps = Object.freeze({
    cairo:Object.freeze({name:'开罗夜色',subtitle:'月下屋顶 · 对称高台',width,ceiling,spawnPoints,platforms}),
    naples:define('那不勒斯港湾','夕照码头 · 货船与吊机',4000,-740,[1770,2230],[
      ['quay-west',160,323,600,'quay'], ['market-roof',860,133,520,'roof'], ['ferry-deck',1320,303,340,'deck'],
      ['harbor-crane',1640,-67,680,'crane'], ['ferry-bridge',2360,273,430,'deck'],
      ['warehouse-roof',2620,83,540,'roof'], ['quay-east',3400,323,460,'quay']
    ]),
    morioh:define('杜王町街区','错层街道 · 车站屋顶',3800,-840,[1680,2120],[
      ['west-bus-stop',120,323,400,'canopy'], ['shop-canopy',650,303,400,'canopy'],
      ['cafe-roof',830,113,540,'roof'], ['bell-tower',1290,-87,360,'clock'],
      ['station-roof',1760,-257,620,'station'], ['east-canopy',2440,303,400,'canopy'],
      ['apartment-roof',2620,83,560,'roof'], ['water-tank',2290,-87,330,'tank'], ['tram-stop',3260,323,400,'canopy']
    ]),
    cape:define('肯尼迪航天中心','发射塔 · 纵向检修高台',4200,-1130,[1880,2320],[
      ['west-launch-base',300,303,560,'deck'], ['west-access',1050,303,380,'deck'],
      ['west-service',980,103,520,'service'], ['west-gantry',1410,-107,470,'gantry'],
      ['launch-arm',1760,-317,620,'gantry'], ['launch-crown',2110,-527,520,'crown'],
      ['east-gantry',2540,-107,450,'gantry'], ['east-service',2880,103,520,'service'],
      ['east-access',2740,303,350,'deck'], ['east-launch-base',3500,303,540,'deck']
    ])
  });
  const catalog = Object.freeze(Object.entries(maps).map(([id,map]) => Object.freeze({id,name:map.name,subtitle:map.subtitle})));
  let ground = Object.freeze({ id:'floor', x:0, y:floor, w:width });
  let surfaces = [...platforms, ground].sort((a,b) => a.y-b.y);
  function select(id) {
    if (!Object.prototype.hasOwnProperty.call(maps,id)) return false;
    const map=maps[id];currentId=id;width=map.width;ceiling=map.ceiling;spawnPoints=map.spawnPoints;platforms=map.platforms;
    ground=Object.freeze({id:'floor',x:0,y:floor,w:width});surfaces=[...platforms,ground].sort((a,b)=>a.y-b.y);
    return true;
  }
  const overlaps = (s, x) => x + footRadius > s.x && x - footRadius < s.x + s.w;
  const contact = s => ({ id: s.id, y: s.y });

  function landing(x, previousY, nextY, vy, dropId = null) {
    if (vy < 0 || nextY < previousY) return null;
    const s = surfaces.find(s => s.id !== dropId && overlaps(s, x)
      && previousY <= s.y + .001 && nextY >= s.y - .001);
    return s ? contact(s) : null;
  }
  function supportAt(x, y) {
    const s = surfaces.find(s => overlaps(s, x) && Math.abs(y - s.y) <= .75);
    return s ? contact(s) : null;
  }
  function surfaceBelow(x, y) {
    const s = surfaces.find(s => overlaps(s, x) && s.y >= y - .75);
    return s ? contact(s) : contact(ground);
  }
  function rect(ctx, x, y, w, h, color) {
    ctx.fillStyle = color; ctx.fillRect(x, y, w, h);
  }
  function polygon(ctx, points, color) {
    ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  }
  function line(ctx, x1, y1, x2, y2, color, lineWidth = 1) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.stroke();
  }
  function arch(ctx, x, y, w, h, color) {
    ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + w * .5);
    ctx.arc(x + w * .5, y + w * .5, w * .5, Math.PI, 0);
    ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  }
  function palm(ctx, x, y, scale, color) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    polygon(ctx, [[-5,0],[3,0],[8,-74],[3,-122],[-2,-120],[2,-71]], color);
    for (const side of [-1, 1]) for (let k = 0; k < 3; k++) {
      ctx.beginPath(); ctx.moveTo(4, -117);
      ctx.quadraticCurveTo(side * (24 + k * 7), -155 + k * 8, side * (58 - k * 11), -113 + k * 14);
      ctx.quadraticCurveTo(side * (24 + k * 8), -135 + k * 9, 4, -117);
      ctx.fillStyle = color; ctx.fill();
    }
    ctx.restore();
  }
  function disc(ctx,x,y,r,color) {ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
  function vessel(ctx,x,y,size,color) {
    ctx.save();ctx.translate(x,y);ctx.scale(size,size);
    polygon(ctx,[[-135,0],[151,0],[123,38],[-108,38]],color);
    rect(ctx,-75,-32,159,32,color);rect(ctx,31,-67,50,35,color);rect(ctx,44,-77,17,10,color);
    for(let i=0;i<7;i++)rect(ctx,-60+i*19,-20,10,9,'#b7d9d444');
    line(ctx,61,-77,61,-115,color,3);line(ctx,61,-111,101,-99,color,2);
    line(ctx,-115,9,136,9,'#c7d4cc33',2);ctx.restore();
  }
  function drawScenicBackground(ctx,camera,W,H,t) {
    const cx=camera.x??width/2,cy=camera.y??220,drift=cx-width/2,mode=currentId;
    const sky=ctx.createLinearGradient(0,0,0,H);
    const colors=mode==='naples'?['#34304f','#bc7178','#f3bd85']:mode==='morioh'?['#303348','#8a9481','#dbc3a0']:['#071426','#163e55','#82a2aa'];
    sky.addColorStop(0,colors[0]);sky.addColorStop(.57,colors[1]);sky.addColorStop(1,colors[2]);
    ctx.save();rect(ctx,0,0,W,H,sky);
    const horizon=H*(mode==='cape'?.68:.57)-(cy-220)*.035;
    if(mode==='naples') {
      const sunX=W*.69-drift*.035,sunY=H*.34-(cy-220)*.024;
      const halo=ctx.createRadialGradient(sunX,sunY,25,sunX,sunY,140);halo.addColorStop(0,'#ffd9a239');halo.addColorStop(1,'#ffd9a200');
      rect(ctx,sunX-140,sunY-140,280,280,halo);disc(ctx,sunX,sunY,47,'#ffd7a2');
      // Vesuvius and the curved shoreline frame the bay rather than a city wall.
      polygon(ctx,[[-90,horizon],[W*.12-drift*.03,horizon-82],[W*.22-drift*.03,horizon-159],[W*.27-drift*.03,horizon-140],[W*.40-drift*.03,horizon-53],[W*.57,horizon],[W*.57,H],[-90,H]],'#625574');
      polygon(ctx,[[0,horizon-21],[W*.17,horizon-64],[W*.35,horizon-25],[W*.55,horizon+9],[W,horizon+22],[W,H],[0,H]],'#756879');
      const sea=ctx.createLinearGradient(0,horizon,0,H);sea.addColorStop(0,'#be9391');sea.addColorStop(.5,'#507b89');sea.addColorStop(1,'#27485f');
      rect(ctx,0,horizon+10,W,H-horizon+Math.abs(cy)*.01,sea);
      for(let i=0;i<23;i++) {
        const y=horizon+15+i*i*.41,x=sunX+Math.sin(i*2.2+t*.17)*(10+i*1.4),half=10+i*3.1;
        line(ctx,x-half,y,x+half,y,'#fbd1a43c',i%3?1:2);
        const waveX=((i*131+t*(2+i%3)-cx*.04)%(W+170)+W+170)%(W+170)-85;
        line(ctx,waveX,y+9,waveX+55+i%4*17,y+9,'#d3dad21c',1);
      }
      for(let i=0;i<16;i++) {
        const x=i*81-((cx*.09)%81),h=22+(i*31)%54;
        rect(ctx,x,horizon-h,63,h+11,i%3?'#856f79':'#ae8581');
        polygon(ctx,[[x-3,horizon-h],[x+31,horizon-h-13],[x+67,horizon-h]],'#695c70');
        for(let k=0;k<3;k++)rect(ctx,x+10+k*17,horizon-h+10,7,10,'#efd0a33e');
      }
      vessel(ctx,W*.79-drift*.10,horizon+69,.92,'#314b60');
      vessel(ctx,W*.28-drift*.06,horizon+28,.36,'#69677b');
      for(let i=0;i<5;i++){const x=((W*.20+i*143-drift*.07)%(W+100)+W+100)%(W+100),y=H*.27+i%3*17;
        line(ctx,x-5,y+2,x,y,'#51425c',1.1);line(ctx,x,y,x+5,y+2,'#51425c',1.1);}
    } else if(mode==='morioh') {
      disc(ctx,W*.27-drift*.025,H*.24-(cy-220)*.018,39,'#eee2aa');
      polygon(ctx,[[-80,horizon],[W*.16,horizon-93],[W*.29,horizon-58],[W*.48,horizon-102],[W*.68,horizon-24],[W,horizon-79],[W+80,H],[-80,H]],'#53656d');
      for(let layer=0;layer<3;layer++) {
        const unit=120+layer*29,depth=.045+layer*.06,offset=((cx*depth)%unit+unit)%unit;
        const base=horizon+35+layer*53-(cy-220)*layer*.025;
        for(let i=-1;i<Math.ceil(W/unit)+2;i++) {
          const n=i+Math.floor(cx*depth/unit),x=i*unit-offset,h=56+((n*43+layer*19)%95+95)%95;
          const shade=[['#849084','#89948b'],['#657d7b','#6a7984'],['#435b69','#4d6070']][layer][Math.abs(n)%2];
          rect(ctx,x,base-h,unit-9,h+H,shade);
          polygon(ctx,[[x-5,base-h],[x+unit*.46,base-h-22],[x+unit-4,base-h]],layer===2?'#394454':'#657073');
          for(let row=0;row<2;row++)for(let col=0;col<3;col++)rect(ctx,x+16+col*(unit-34)/3,base-h+18+row*31,12,17,(n+row+col)%3?'#263a4738':'#e7c9a047');
          if(layer===2)rect(ctx,x+8,base-34,unit-27,9,Math.abs(n)%2?'#b1858455':'#c4ac8e55');
        }
      }
      // Radio mast and utility wires are distant silhouettes, never platforms.
      const towerX=W*.78-drift*.065,towerY=horizon-170;
      line(ctx,towerX-25,horizon+10,towerX,towerY,'#374c5e',3);line(ctx,towerX+25,horizon+10,towerX,towerY,'#374c5e',3);
      for(let k=0;k<6;k++){const y=towerY+24+k*27,w=(y-towerY)/8;line(ctx,towerX-w,y,towerX+w,y,'#374c5e',2);}
      disc(ctx,towerX,towerY-3,2.5,'#e9ac9b');
      for(let i=-1;i<5;i++){const x=i*350-(cx*.15)%350;rect(ctx,x,horizon-62,6,260,'#334955');
        ctx.beginPath();ctx.moveTo(x,horizon-52);ctx.quadraticCurveTo(x+175,horizon-5,x+350,horizon-52);ctx.strokeStyle='#2b3e4d';ctx.lineWidth=1;ctx.stroke();}
    } else {
      for(let i=0;i<78;i++){const x=((i*173+19-cx*.01)%W+W)%W,y=24+(i*67)%Math.max(50,Math.floor(H*.56));disc(ctx,x,y,i%13? .7:1.2,i%4?'#dbeaf589':'#eefcffbb');}
      const moonX=W*.18-drift*.021,moonY=H*.21-(cy-220)*.017;
      disc(ctx,moonX,moonY,28,'#d2e3e4');disc(ctx,moonX+8,moonY-4,25,'#28475b');
      polygon(ctx,[[0,horizon-17],[W*.22,horizon-33],[W*.43,horizon-9],[W*.63,horizon-24],[W,horizon-14],[W,H],[0,H]],'#294c59');
      rect(ctx,0,horizon+9,W,H,'#153749');
      for(let i=0;i<6;i++){const x=i*255-((cx*.06)%255);rect(ctx,x,horizon-18,154,53,'#305265');rect(ctx,x+11,horizon-26,132,9,'#5b7d8844');
        for(let k=0;k<6;k++)rect(ctx,x+15+k*21,horizon-7,11,4,'#8ed9d03f');}
      const farX=W*.70-drift*.04;rect(ctx,farX,horizon-146,24,146,'#385d6b');
      line(ctx,farX+12,horizon-147,farX+12,horizon-214,'#527785',3);
      ctx.beginPath();ctx.ellipse(farX+12,horizon-154,54,14,-.25,0,Math.PI*2);ctx.strokeStyle='#6c8993';ctx.lineWidth=3;ctx.stroke();
      for(let i=0;i<11;i++)line(ctx,0,horizon+40+i*14,W,horizon+40+i*14,'#88b9b00b',1);
    }
    for(let i=0;i<4;i++) {
      const span=W+540,x=((i*367+t*(mode==='cape'?1:1.6)-cx*.017)%span+span)%span-270,y=H*.17+i*31;
      polygon(ctx,[[x,y],[x+120,y-7],[x+302,y+2],[x+235,y+10],[x+38,y+7]],mode==='naples'?'#ffc9ad15':mode==='morioh'?'#eddfc717':'#b3d5dc0b');
    }
    ctx.restore();
  }
  function drawScenicPlatform(ctx,p,index) {
    const {x,y,w}=p,mode=currentId;
    if(mode==='naples') {
      const metal=p.kind==='crane',deck=p.kind==='deck';
      rect(ctx,x-3,y+7,w+6,30,'#172d418c');rect(ctx,x,y,w,7,metal?'#dfb665':deck?'#bed9d2':'#d2c4aa');
      rect(ctx,x,y+7,w,23,metal?'#896536':deck?'#46737d':'#856c68');rect(ctx,x+7,y+30,w-14,7,'#354958');
      for(let at=x+18;at<x+w-10;at+=metal?48:37){line(ctx,at,y+8,at+(metal?19:0),y+28,metal?'#352f32':'#354b596e',metal?7:1.3);}
      for(const side of [x+20,x+w-35]){rect(ctx,side,y+8,14,5,'#f3d7a299');line(ctx,side,y+35,side+17,y+55,'#345362',4);}
      line(ctx,x,y,x+w,y,metal?'#ffe3a1':'#e9e0c6',2);
      if(deck){rect(ctx,x+26,y+16,w-52,3,'#aed2d077');for(let k=0;k<4;k++)disc(ctx,x+w*(k+1)/5,y+23,3,'#183f52');}
    } else if(mode==='morioh') {
      const shop=p.kind==='canopy',featured=p.kind==='station';
      rect(ctx,x-5,y+9,w+10,29,'#27334488');rect(ctx,x,y,w,6,featured?'#d6b6bb':'#d2c9b0');
      rect(ctx,x,y+6,w,24,shop?'#9c737b':p.kind==='tank'?'#587e85':'#657e85');
      rect(ctx,x+6,y+30,w-12,8,'#354b5e');line(ctx,x,y,x+w,y,'#f5dfb8',2);
      for(let at=x+11;at<x+w-8;at+=32){rect(ctx,at,y+7,14,11,shop?'#d9bea783':'#b7c6bd33');line(ctx,at,y+24,at+21,y+24,'#a8b5ac44',1);}
      if(p.kind==='clock'){disc(ctx,x+w/2,y+35,23,'#324756');disc(ctx,x+w/2,y+35,18,'#d4c7aa');line(ctx,x+w/2,y+35,x+w/2-8,y+27,'#465666',2);line(ctx,x+w/2,y+35,x+w/2+11,y+33,'#465666',2);}
      else if(featured){rect(ctx,x+w/2-92,y+9,184,18,'#384d5f');ctx.fillStyle='#ead5b1';ctx.font='600 10px sans-serif';ctx.textAlign='center';ctx.fillText('M O R I O H   S T A T I O N',x+w/2,y+22);}
      else for(const at of [x+35,x+w-35])polygon(ctx,[[at-9,y+37],[at+9,y+37],[at,y+58]],'#4b5f6d');
    } else {
      rect(ctx,x-4,y+8,w+8,28,'#071d308e');rect(ctx,x,y,w,6,p.kind==='crown'?'#dde6cc':'#b9d9d5');
      rect(ctx,x,y+6,w,25,'#416675');line(ctx,x,y,x+w,y,'#e3f2dc',2);
      rect(ctx,x+8,y+31,w-16,5,'#1b3448');
      for(let at=x+12;at<x+w-14;at+=37){line(ctx,at,y+9,at+20,y+28,'#172e42',3);line(ctx,at+20,y+9,at,y+28,'#7095a055',1);}
      for(const edge of [x,x+w-51]){rect(ctx,edge,y+6,51,7,'#d4b65b');for(let k=0;k<4;k++)line(ctx,edge+k*13,y+6,edge+k*13+7,y+13,'#3f4549',3);}
      for(const at of [x+70,x+w-70]){rect(ctx,at,y+15,7,4,'#b8f4df');line(ctx,at,y+36,at+17,y+64,'#325263',5);}
    }
  }
  function drawScenicWorld(ctx,camera,W,H,t) {
    const zoom=Math.max(.1,camera.zoom||1),cx=camera.x??width/2,cy=camera.y??220;
    const left=cx-W/(2*zoom)-160,right=cx+W/(2*zoom)+160,top=cy-H*.6/zoom-90,bottom=cy+H*.4/zoom+130;
    const visible=(x,w,y,h)=>x+w>=left&&x<=right&&y+h>=top&&y<=bottom;
    ctx.save();
    if(currentId==='naples') {
      const p=platforms.find(p=>p.kind==='crane');
      if(visible(p.x,p.w,p.y+30,floor-p.y)){
        for(const x of [p.x+45,p.x+p.w-65]){rect(ctx,x,p.y+35,20,floor-p.y+40,'#725c4860');
          for(let y=p.y+55;y<floor;y+=65){line(ctx,x,y,x+20,y+40,'#b38c5750',3);line(ctx,x+20,y,x,y+40,'#302e395b',3);}}
        for(const side of [-1,1])line(ctx,p.x+p.w/2,p.y+38,p.x+p.w/2+side*250,floor-30,'#c2a77723',2);
      }
      for(const [x,w,h,color]of [[420,250,80,'#437e8380'],[3140,280,120,'#a1746380'],[3240,190,170,'#78817b70']])if(visible(x,w,floor-h,h)){
        rect(ctx,x,floor-h,w,h,color);for(let at=x+12;at<x+w;at+=22)line(ctx,at,floor-h+5,at,floor-6,'#21384955',2);
        rect(ctx,x+11,floor-h+13,48,7,'#d6d0b133');}
      for(const x of [220,800,2980,3740])if(visible(x,35,floor-34,40)){rect(ctx,x,floor-16,28,19,'#2f4b58');disc(ctx,x+14,floor-19,15,'#547782');line(ctx,x-27,floor-7,x+40,floor-7,'#a1a39155',2);}
    } else if(currentId==='morioh') {
      for(const [x,w,h,color]of [[350,290,157,'#7e697066'],[1460,190,212,'#5c78805c'],[3220,320,183,'#706c865d']])if(visible(x,w,floor-h,h)){
        rect(ctx,x,floor-h,w,h,color);rect(ctx,x-7,floor-h-9,w+14,10,'#52697880');
        for(let row=0;row<3;row++)for(let col=0;col<4;col++)rect(ctx,x+23+col*(w-35)/4,floor-h+20+row*39,22,23,(row+col)%3?'#283e493e':'#e1bf8844');
        rect(ctx,x+12,floor-44,w-24,11,'#bc8b895a');}
      for(const x of [570,2980])if(visible(x,60,floor-182,185)){
        rect(ctx,x,floor-161,5,161,'#344b5c');line(ctx,x,floor-160,x+32,floor-160,'#344b5c',4);rect(ctx,x+24,floor-154,13,29,'#344b5c');disc(ctx,x+30.5,floor-146,3,'#e2b18b88');disc(ctx,x+30.5,floor-134,3,'#a4c9ab66');}
    } else {
      // The access platforms are physically attached to the launch gantry;
      // the huge rocket is a muted backdrop behind the traversable decks.
      if(visible(2080,670,-580,1070)){
        for(const x of [2515,2690]){rect(ctx,x,-492,18,975,'#45677783');for(let y=-478;y<floor-20;y+=78){line(ctx,x,y,x+18,y+57,'#78989861',2);}}
        for(let y=-480;y<floor-20;y+=95){line(ctx,2533,y,2690,y+85,'#3658667b',3);line(ctx,2690,y,2533,y+85,'#3658667b',3);line(ctx,2533,y,2690,y,'#8cb0ad42',2);}
        rect(ctx,2253,-316,87,704,'#aabcb77a');polygon(ctx,[[2253,-316],[2296,-408],[2340,-316]],'#d3d7c886');
        rect(ctx,2262,-249,69,27,'#36556580');rect(ctx,2262,167,69,39,'#3c5b6899');
        polygon(ctx,[[2253,269],[2214,395],[2253,382]],'#adbdb679');polygon(ctx,[[2340,269],[2379,395],[2340,382]],'#adbdb679');
        rect(ctx,2287,-280,9,548,'#e5e5cf38');rect(ctx,2228,386,137,44,'#3b5b6c');
        for(let i=0;i<5;i++)disc(ctx,2533,-480+i*192,3,'#ffc478a6');
      }
      for(const x of [400,3490])if(visible(x,290,floor-82,85)){
        rect(ctx,x,floor-65,270,65,'#44697577');rect(ctx,x+27,floor-79,202,14,'#71918e6a');
        for(let i=0;i<7;i++)rect(ctx,x+19+i*34,floor-49,19,7,'#a9d8cd5c');}
    }
    if(bottom>=floor) {
      const groundH=Math.max(600,bottom-floor+30),base=ctx.createLinearGradient(0,floor,0,floor+360);
      const tones=currentId==='naples'?['#6a7674','#324d5b','#1b3045']:currentId==='morioh'?['#62646c','#393d50','#202839']:['#385667','#20384c','#101f32'];
      tones.forEach((v,i)=>base.addColorStop(i*.5,v));rect(ctx,left,floor,right-left,groundH,base);
      const edge=currentId==='naples'?'#d2c7a9':currentId==='morioh'?'#d9c6b4':'#b2d1d3';
      rect(ctx,left,floor,right-left,6,edge);rect(ctx,left,floor+6,right-left,17,tones[0]);line(ctx,left,floor,right,floor,edge,2);
      for(let x=Math.floor(left/120)*120;x<right;x+=120){line(ctx,x,floor+3,x,floor+23,'#152c405e',2);rect(ctx,x+17,floor+35,80,3,'#afc3b817');
        if(currentId==='naples'){rect(ctx,x+7,floor+25,9,75,'#304759');rect(ctx,x+92,floor+25,9,75,'#304759');line(ctx,x+14,floor+91,x+96,floor+91,'#84988c44',2);}
        else if(currentId==='morioh'){rect(ctx,x+17,floor+60,76,50,'#202f42');line(ctx,x+55,floor+60,x+55,floor+110,'#5b6f77',3);}
        else {rect(ctx,x+20,floor+43,72,34,'#152c3f');rect(ctx,x+25,floor+48,62,3,'#66959855');}}
      if(currentId==='cape')for(let x=Math.floor(left/72)*72;x<right;x+=72)polygon(ctx,[[x,floor+8],[x+18,floor+8],[x+4,floor+19],[x-14,floor+19]],'#d1b76370');
      if(currentId==='morioh')for(let x=width/2-220;x<width/2+220;x+=55)rect(ctx,x,floor+8,31,6,'#e6d8b39a');
      for(const x of [0,width-17]){rect(ctx,x,floor,17,groundH,'#748a8c');rect(ctx,x,floor,17,8,'#ebd4a4');}
      if(left<0)rect(ctx,left,floor,-left,groundH,'#0c1d30b9');if(right>width)rect(ctx,width,floor,right-width,groundH,'#0c1d30b9');
    }
    platforms.forEach((p,i)=>{if(visible(p.x,p.w,p.y,75))drawScenicPlatform(ctx,p,i);});
    ctx.restore();
  }
  function drawBackground(ctx, camera, W, H, t = 0) {
    if (currentId !== 'cairo') { drawScenicBackground(ctx,camera,W,H,t); return; }
    ctx.save();
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#111424'); sky.addColorStop(.52, '#373044');
    sky.addColorStop(1, '#8b6b6d'); rect(ctx, 0, 0, W, H, sky);
    const z = camera.zoom || 1, cx = camera.x ?? width / 2, cy = camera.y ?? 220;
    const moonX = W * .74 - (cx - width / 2) * .028;
    const moonY = H * .23 - (cy - 220) * .025;
    const halo = ctx.createRadialGradient(moonX, moonY, 16, moonX, moonY, 112);
    halo.addColorStop(0, '#e2ceb123'); halo.addColorStop(1, '#e2ceb100');
    rect(ctx, moonX - 112, moonY - 112, 224, 224, halo);
    ctx.beginPath(); ctx.arc(moonX, moonY, 33, 0, Math.PI * 2);
    ctx.fillStyle = '#e0cbb1'; ctx.fill();
    ctx.beginPath(); ctx.arc(moonX + 8, moonY - 9, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#c3b4a15c'; ctx.fill();
    for (let i = 0; i < 48; i++) {
      const x = ((i * 193 + 71 - cx * .008) % W + W) % W;
      const y = 44 + ((i * 79 + 13) % Math.max(80, Math.floor(H * .45)));
      rect(ctx, x, y, i % 7 ? 1 : 1.7, i % 7 ? 1 : 1.7, i % 3 ? '#ddc8b47a' : '#eee0cfa0');
    }
    // Buildings remain screen-space so zooming out never exposes empty canvas.
    for (let layer = 0; layer < 3; layer++) {
      const depth = .045 + layer * .075;
      const unit = 75 + layer * 22, offset = ((cx * depth) % unit + unit) % unit;
      const base = H * (.60 + layer * .095) - (cy - 220) * (.04 + layer * .06) * Math.max(.65, z);
      const color = ['#514355', '#3c3546', '#272938'][layer];
      for (let i = -2; i < Math.ceil(W / unit) + 3; i++) {
        const seed = i + Math.floor(cx * depth / unit), x = i * unit - offset;
        const buildingH = 37 + ((seed * 37 + layer * 43) % 101 + 101) % 101;
        const top = base - buildingH;
        rect(ctx, x, top, unit - 5, buildingH + H, color);
        if ((seed % 5 + 5) % 5 === 1) {
          const towerX = x + unit * .5;
          rect(ctx, towerX - 8, top - 64, 16, 64, color);
          rect(ctx, towerX - 12, top - 31, 24, 5, color);
          polygon(ctx, [[towerX - 8, top - 64], [towerX, top - 88], [towerX + 8, top - 64]], color);
          line(ctx, towerX, top - 88, towerX, top - 96, color, 2);
        } else if ((seed % 4 + 4) % 4 === 0) {
          ctx.beginPath(); ctx.arc(x + unit * .48, top + 2, unit * .29, Math.PI, 0);
          ctx.fillStyle = color; ctx.fill();
        }
        if (layer > 0) for (let k = 0; k < 3; k++) {
          const lit = (seed + k * 2 + layer) % 4 === 0;
          arch(ctx, x + 12 + k * (unit - 24) / 3, top + 19, 7, 17,
            lit ? (layer === 2 ? '#b88b6355' : '#af806c3d') : '#1d233027');
        }
      }
      if (layer === 2) for (let i = 0; i < 5; i++)
        palm(ctx, i * 320 - ((cx * .19) % 320), base + 40, .84, '#202735');
    }
    // Very slow cloud bands add depth without distracting motion behind combat.
    for (let i = 0; i < 4; i++) {
      const bandX = (((i * 377 + t * 1.4 - cx * .022) % (W + 600)) + W + 600) % (W + 600) - 300;
      const y = H * .33 + i * 24;
      polygon(ctx, [[bandX,y],[bandX+145,y-5],[bandX+291,y+1],[bandX+111,y+5]], '#b0a0ab0d');
    }
    ctx.restore();
  }
  function drawPlatform(ctx, p, index) {
    const {x, y, w} = p, featured = p.id === 'clock-roof';
    // Slabs have a flat, bright collision edge and a shaded 3D underside.
    rect(ctx, x - 4, y + 8, w + 8, 24, '#171b2a88');
    rect(ctx, x, y, w, 7, featured ? '#dfc18a' : '#c7b09a');
    rect(ctx, x, y + 7, w, 20, '#786a6b');
    rect(ctx, x + 5, y + 27, w - 10, 7, '#443e50');
    rect(ctx, x, y, w, 2, featured ? '#ffe4a9' : '#e6d3b5');
    line(ctx, x + 12, y + 7, x + w - 12, y + 7, '#eee0c644');
    // Shallow edge bevels and the recessed frieze read as masonry, while all
    // ornament stays below the collision edge and behind the fighters.
    polygon(ctx, [[x,y+7],[x+7,y+10],[x+7,y+25],[x,y+27]], '#a28d88');
    polygon(ctx, [[x+w-7,y+10],[x+w,y+7],[x+w,y+27],[x+w-7,y+25]], '#544b5b');
    rect(ctx, x + 12, y + 24, w - 24, 2, '#d3b28b55');
    for (let bx = x + 22; bx < x + w - 10; bx += 44) {
      line(ctx, bx, y + 8, bx, y + 26, '#514753', 2);
      rect(ctx, bx - 15, y + 12, 20, 2, '#99858666');
    }
    const brackets = w > 280 ? [34, w / 2, w - 34] : [34, w - 34];
    brackets.forEach(offset => {
      polygon(ctx, [[x+offset-14,y+33],[x+offset+14,y+33],[x+offset+7,y+57],[x+offset,y+67],[x+offset-7,y+57]], '#554c5b');
      polygon(ctx, [[x+offset-14,y+33],[x+offset,y+35],[x+offset,y+63],[x+offset-7,y+57]], '#74616b');
      rect(ctx, x + offset - 18, y + 28, 36, 6, '#897579');
    });
    // Gold edge markers make narrow platforms readable at the widest camera view.
    rect(ctx, x, y, 17, 7, '#e7c381'); rect(ctx, x + w - 17, y, 17, 7, '#e7c381');
    if (featured) {
      const mid = x + w * .5;
      rect(ctx, mid - 44, y + 9, 88, 16, '#554a58');
      polygon(ctx, [[mid-12,y+16],[mid,y+8],[mid+12,y+16],[mid,y+25]], '#ddbd79');
      polygon(ctx, [[mid-6,y+16],[mid,y+12],[mid+6,y+16],[mid,y+21]], '#806971');
      for (const side of [-1, 1]) {
        line(ctx, mid + side * 20, y + 15, mid + side * 35, y + 15, '#c4a471', 2);
        line(ctx, mid + side * 20, y + 20, mid + side * 30, y + 20, '#a58b6d');
      }
    } else {
      for (let k = 0; k < 2 + index % 2; k++) rect(ctx, x + w * .5 - 9 + k * 7, y + 15, 3, 4, '#d6bb9666');
    }
  }
  function drawWorld(ctx, camera, W, H, t = 0) {
    if (currentId !== 'cairo') { drawScenicWorld(ctx,camera,W,H,t); return; }
    ctx.save();
    const z = Math.max(.1, camera.zoom || 1), cx = camera.x ?? width / 2;
    const cy = camera.y ?? 220, left = cx - W / z / 2 - 160;
    const right = cx + W / z / 2 + 160;
    // The game anchors world camera.y at 60% of screen height, below the HUD.
    const top = cy - H * .6 / z - 90, bottom = cy + H * .4 / z + 130;
    if (bottom >= floor) {
      const groundH = Math.max(760, bottom - floor + 20);
      const masonry = ctx.createLinearGradient(0, floor, 0, floor + 400);
      masonry.addColorStop(0, '#63535e'); masonry.addColorStop(.4, '#342d40'); masonry.addColorStop(1, '#171b2a');
      rect(ctx, left, floor, right - left, groundH, masonry);
      rect(ctx, left, floor, right - left, 6, '#c8b399');
      rect(ctx, left, floor + 6, right - left, 12, '#827080');
      rect(ctx, left, floor + 18, right - left, 5, '#2a293a');
      rect(ctx, left, floor + 23, right - left, 12, '#504454');
      line(ctx, left, floor, right, floor, '#ead9b6', 2);
      for (let x = Math.floor(left / 90) * 90; x < right; x += 90) {
        line(ctx, x, floor + 1, x, floor + 17, '#51434e', 2);
        line(ctx, x + 45, floor + 24, x + 45, floor + 55, '#25263970', 1);
      }
      // A low inlaid star and symmetric paving identify the main fighting
      // space without an obstacle, a raised railing or a label over the action.
      const center = width / 2;
      rect(ctx, center - 236, floor + 6, 472, 2, '#e1bf815c');
      line(ctx, center - 236, floor + 17, center + 236, floor + 17, '#bfa37d55');
      for (const offset of [-210, -140, 140, 210]) {
        polygon(ctx, [[center+offset-6,floor+11],[center+offset,floor+7],
          [center+offset+6,floor+11],[center+offset,floor+15]], '#bca18488');
      }
      polygon(ctx, [[center-29,floor+11],[center-10,floor+9],[center,floor+4],
        [center+10,floor+9],[center+29,floor+11],[center+10,floor+13],
        [center,floor+18],[center-10,floor+13]], '#e7c78f');
      polygon(ctx, [[center-12,floor+11],[center,floor+8],[center+12,floor+11],[center,floor+14]], '#7a6370');
      for (let x = Math.floor(left / 210) * 210 + 40; x < right; x += 210) {
        arch(ctx, x, floor + 65, 68, 115, '#88717a');
        arch(ctx, x + 6, floor + 71, 56, 109, '#202433');
        arch(ctx, x + 11, floor + 76, 46, 104, '#332e3c');
        line(ctx, x + 34, floor + 95, x + 34, floor + 179, '#121c2c', 4);
        line(ctx, x + 10, floor + 125, x + 58, floor + 125, '#182033', 4);
        rect(ctx, x - 5, floor + 179, 78, 7, '#725c69');
      }
      // Rooftop width is tangible: masonry caps frame both arena ends.
      for (const x of [0, width - 16]) {
        rect(ctx, x, floor, 16, groundH, '#846e77');
        rect(ctx, x, floor, 16, 8, '#d8bc92');
      }
      // Faded ground beyond the side rails fills zoomed-out views without implying
      // that the rooftop can be traversed outside its physical world bounds.
      if (left < 0) rect(ctx, left, floor, -left, groundH, '#121827b0');
      if (right > width) rect(ctx, width, floor, right - width, groundH, '#121827b0');
    }
    platforms.forEach((p, i) => {
      if (p.x + p.w >= left && p.x <= right && p.y + 70 >= top && p.y <= bottom) drawPlatform(ctx, p, i);
    });
    ctx.restore();
  }
  return Object.freeze({catalog,select,get currentId(){return currentId;},get width(){return width;},floor,
    get ceiling(){return ceiling;},get spawnPoints(){return spawnPoints;},get platforms(){return platforms;},
    surfaceBelow,landing,supportAt,drawBackground,drawWorld});
})();
