// Original tile-based adventure engine. Study content is data, never executable code.
const TILE = 32, W = 36, H = 26;
const THEMES = {
  crystal: { sky:'#182e43', water:'#3b7898', deep:'#28546f', ground:'#8eadb0', light:'#a9c8c5', path:'#d8c9aa', tree:'#728b9d', accent:'#b4eddf', name:'Cumbres', guide:'Nilo' },
  forest: { sky:'#193e37', water:'#377d85', deep:'#235962', ground:'#75a35d', light:'#8bb86a', path:'#cfbc8e', tree:'#315f42', accent:'#e6dc80', name:'Bosque', guide:'Luma' },
  ruins: { sky:'#483b47', water:'#648c98', deep:'#416a80', ground:'#bca078', light:'#c9b087', path:'#e2cda4', tree:'#887b68', accent:'#e5be76', name:'Ruinas', guide:'Uma' },
  autumn: { sky:'#513941', water:'#628fa4', deep:'#426b85', ground:'#b19766', light:'#c2a876', path:'#e0c9a7', tree:'#b36243', accent:'#f3ce89', name:'Valle', guide:'Tilo' },
  coast: { sky:'#214759', water:'#479baa', deep:'#307487', ground:'#bbca8d', light:'#d1d7a1', path:'#efdfb5', tree:'#4c8768', accent:'#f5dd93', name:'Costa', guide:'Mara' },
  meadow: { sky:'#283c48', water:'#558b9b', deep:'#386777', ground:'#88ad79', light:'#9abe89', path:'#ded2a7', tree:'#527a55', accent:'#e4d693', name:'Islas', guide:'Ari' },
};
const normalize = value => value.trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
function el(tag, cls, text) { const n=document.createElement(tag); if(cls)n.className=cls; if(text!==undefined)n.textContent=text; return n; }
function button(label, fn, cls='adventure-button') { const b=el('button',cls,label); b.type='button';b.addEventListener('click',fn);return b; }
function hash(text) { let h=2166136261;for(const c of text) h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0; }
function rng(seed) { return () => {seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}; }

export function makeMap(world) {
  const random=rng(hash(world.id+world.biome));
  const variant=Object.keys(THEMES).indexOf(world.biome);
  const bridgeY=11+variant%3, riverX=17+variant%2;
  const spawn={x:3,y:bridgeY}, guide={x:5,y:bridgeY-1}, workshop={x:9,y:bridgeY};
  const guardian={x:riverX+6,y:bridgeY}, beacon={x:31,y:bridgeY-3};
  const pickups=[{x:6,y:5},{x:13,y:7},{x:6,y:20},{x:13,y:19}];
  const tiles=Array.from({length:H},(_,y)=>Array.from({length:W},(_,x)=>
    x<2||y<2||x>W-3||y>H-3||x===riverX||x===riverX+1 ? 'water' : 'grass'));
  for(let y=3;y<H-3;y++)for(let x=3;x<W-3;x++) if(tiles[y][x]==='grass'&&random()<.18) tiles[y][x]='tree';
  const carve=(a,b)=>{let {x,y}=a;while(x!==b.x){if(tiles[y][x]!=='water')tiles[y][x]='path';x+=Math.sign(b.x-x);}while(y!==b.y){if(tiles[y][x]!=='water')tiles[y][x]='path';y+=Math.sign(b.y-y);}if(tiles[y][x]!=='water')tiles[y][x]='path';};
  carve(spawn,{x:32,y:bridgeY});
  [guide,workshop,...pickups].forEach(point=>carve({x:9,y:bridgeY},point));
  carve(guardian,beacon);
  for(let x=riverX;x<=riverX+1;x++) tiles[bridgeY][x]='bridge';
  // Keep a small clearing around interactable objects, with all routes connected.
  for(const p of [spawn,guide,workshop,guardian,beacon,...pickups])
    for(let y=p.y-1;y<=p.y+1;y++)for(let x=p.x-1;x<=p.x+1;x++)if(tiles[y]?.[x]&&tiles[y][x]!=='water'&&tiles[y][x]!=='bridge') tiles[y][x]='path';
  return {tiles,spawn,guide,workshop,guardian,beacon,pickups,bridgeY,riverX,width:W,height:H};
}
export function walkable(map,x,y,bridgeOpen) {
  const tile=map.tiles[y]?.[x];return tile==='grass'||tile==='path'||(tile==='bridge'&&bridgeOpen);
}
export function findPath(map,start,end,bridgeOpen) {
  if(!walkable(map,end.x,end.y,bridgeOpen))return [];
  const key=p=>`${p.x},${p.y}`, queue=[start], previous=new Map([[key(start),null]]);
  for(let i=0;i<queue.length;i++) {
    const p=queue[i];if(p.x===end.x&&p.y===end.y){const path=[];let q=p;while(previous.get(key(q))){path.unshift(q);q=previous.get(key(q));}return path;}
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const q={x:p.x+dx,y:p.y+dy};if(walkable(map,q.x,q.y,bridgeOpen)&&!previous.has(key(q))){previous.set(key(q),p);queue.push(q);}}
  }return [];
}
function rect(c,color,x,y,w,h){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h);}
function person(c,x,y,color,step=0,hat=false){
  rect(c,'#25414a66',x-10,y+10,21,6);rect(c,'#273e48',x-7,y+6,5,8+(step%2)*2);rect(c,'#273e48',x+2,y+6,5,10-(step%2)*2);
  rect(c,color,x-9,y-8,18,18);rect(c,'#e7ad83',x-6,y-21,12,14);rect(c,'#303f43',x-7,y-23,14,6);
  rect(c,'#213342',x+2,y-15,2,2);if(hat){rect(c,'#ecd69e',x-10,y-25,19,5);rect(c,'#ecd69e',x-6,y-30,12,6);}
  rect(c,'#f0d07f',x-8,y-5,4,10);
}
function terrain(c,map,theme,tick,bridgeOpen) {
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const tile=map.tiles[y][x], px=x*TILE,py=y*TILE;
    if(tile==='water'||tile==='bridge'){
      rect(c,theme.water,px,py,TILE,TILE);rect(c,theme.deep,px+(x*7+y*5)%15,py+17,13,2);
      rect(c,'#c3e7df55',px+(x+y+Math.floor(tick/1000))%12,py+6,10,2);
      if(tile==='bridge'&&bridgeOpen){rect(c,'#785a44',px,py+3,32,26);for(let j=0;j<4;j++)rect(c,'#d6b77b',px+j*8,py+5,6,22);}
      if(tile==='bridge'&&!bridgeOpen){rect(c,'#dec294',px,py+5,6,22);rect(c,'#dec294',px+26,py+5,6,22);}
    }else{
      rect(c,(x*13+y*7)%5===0?theme.light:theme.ground,px,py,TILE,TILE);
      if(tile==='path'){rect(c,theme.path,px,py,TILE,TILE);rect(c,'#6f795333',px+8,py+20,3,2);}
      else if(tile!=='tree'){rect(c,'#496b4933',px+8,py+13,2,5);if((x*7+y)%13===0)rect(c,theme.accent,px+20,py+8,3,3);}
    }
  }
}
function tree(c,x,y,theme,biome){
  const px=x*TILE,py=y*TILE;
  rect(c,'#173e3a22',px-4,py+22,39,13);
  if(biome==='crystal'){rect(c,'#53798d',px+4,py+4,24,24);rect(c,'#c7eeec',px+10,py-9,12,33);rect(c,'#9dc5d0',px+3,py+1,10,22);rect(c,'#6895ab',px+22,py+9,6,19);}
  else if(biome==='ruins'){rect(c,'#786f69',px+6,py-10,22,42);rect(c,'#d6c2a0',px+3,py-14,28,7);rect(c,'#b7a68a',px+8,py-4,15,32);rect(c,'#8c826f',px+17,py,3,21);}
  else{rect(c,'#745b42',px+13,py+13,8,20);rect(c,theme.tree,px,py-6,32,25);rect(c,theme.tree,px+6,py-18,22,33);rect(c,'#ffffff19',px+7,py-12,15,6);rect(c,'#142f3522',px+1,py+14,29,7);}
}
function workshop(c,p,theme){const x=p.x*TILE,y=p.y*TILE;rect(c,'#463e34',x-9,y-3,50,34);rect(c,'#ddbc82',x-12,y-10,56,13);rect(c,theme.accent,x-5,y-20,12,11);rect(c,'#8b6951',x-5,y+17,8,16);rect(c,'#8b6951',x+27,y+17,8,16);}
function beacon(c,p,theme,lit){const x=p.x*TILE,y=p.y*TILE;rect(c,'#3b515c44',x-17,y+18,66,17);rect(c,'#81918a',x-7,y-30,46,60);rect(c,'#d5d7b5',x+3,y-54,26,75);rect(c,'#667c83',x,y-58,32,9);rect(c,lit?'#ffdf80':'#365968',x+7,y-48,18,18);rect(c,'#425b65',x+9,y+6,14,23);if(lit){rect(c,'#ffecac66',x-4,y-53,39,7);rect(c,'#f9db7933',x-13,y-60,58,7);}}
function label(c,text,x,y){c.font='bold 11px monospace';c.textAlign='center';const width=c.measureText(text).width+12;rect(c,'#19323be8',x-width/2,y-14,width,19);c.fillStyle='#fff6dc';c.fillText(text,x,y);}

export class Adventure {
  constructor(pack,onClose=()=>{}){
    this.pack=pack;this.onClose=onClose;this.signature=String(hash(JSON.stringify(pack)));this.progress={};this.keys=new Set();this.path=[];this.lastFrame=0;this.camera={x:0,y:0};this.abort=new AbortController();
    try{const saved=JSON.parse(sessionStorage.getItem('isla-world-progress'));if(saved?.signature===this.signature&&saved.expires>Date.now())this.progress=saved.worlds||{};}catch{}
    this.dialog=el('dialog','adventure-dialog');this.dialog.setAttribute('aria-label','Videojuego Isla Saber');this.dialog.id='adventure-dialog';
    document.body.append(this.dialog);this.dialog.addEventListener('cancel',e=>{e.preventDefault();this.close();});
    const signal=this.abort.signal;
    window.addEventListener('keydown',e=>this.key(e,true),{signal});window.addEventListener('keyup',e=>this.key(e,false),{signal});
    window.addEventListener('blur',()=>this.keys.clear(),{signal});document.addEventListener('visibilitychange',()=>{this.keys.clear();this.lastFrame=0;},{signal});
    this.dialog.showModal();this.menu();
  }
  save(){try{sessionStorage.setItem('isla-world-progress',JSON.stringify({signature:this.signature,expires:Date.now()+24*3600*1000,worlds:this.progress}));this.storageOK=true;}catch{this.storageOK=false;}}
  close(){this.save();this.abort.abort();cancelAnimationFrame(this.frame);this.dialog.close();this.dialog.remove();this.onClose();}
  menu(){
    cancelAnimationFrame(this.frame);this.keys.clear();this.world=null;this.path=[];
    const main=el('div','world-select'), top=el('header','world-select-top');top.append(el('span','adventure-kicker','ISLA SABER · ATLAS DE AVENTURAS'),button('Volver a mis apuntes',()=>this.close(),'adventure-quiet'));
    main.append(top,el('h1','',`Tu próxima aventura, ${this.pack.preferences.nickname}`),el('p','world-intro','Cada materia abre un mundo. Explora, recupera sus piezas y vuelve a encender el faro.'));
    const cards=el('div','world-cards');
    for(const world of this.pack.engine.worlds){
      const card=el('article','world-card');card.dataset.biome=world.biome;
      const preview=el('canvas');preview.width=576;preview.height=320;preview.setAttribute('aria-hidden','true');
      const c=preview.getContext('2d');c.scale(.5,.5);const map=makeMap(world),theme=THEMES[world.biome];terrain(c,map,theme,0,true);
      for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(map.tiles[y][x]==='tree')tree(c,x,y,theme,world.biome);
      beacon(c,{x:27,y:12},theme,true);person(c,290,330,'#b55e44',0,true);
      card.append(preview,el('p','adventure-kicker',world.subject),el('h2','',world.name),el('p','',`${world.missions.length} misiones · Exploración y encuentros`),button(this.progress[world.id]?.complete?'Volver a explorar':this.progress[world.id]?'Continuar aventura':'Entrar al mundo',()=>this.start(world)));
      if(this.progress[world.id]?.complete)card.append(el('span','world-complete','★ Faro recuperado'));
      cards.append(card);
    }
    main.append(cards,el('p','world-footnote','Teclado: flechas o WASD · E para interactuar · En pantalla táctil, usa los controles o toca el camino. El progreso se conserva en esta pestaña mientras tu sesión esté disponible.'));
    this.dialog.replaceChildren(main);main.querySelector('.world-card button')?.focus();
  }
  start(world){
    this.world=world;this.theme=THEMES[world.biome];this.map=makeMap(world);this.keys.clear();this.path=[];this.lastFrame=0;this.moveClock=0;this.messageOpen=false;
    const saved=this.progress[world.id];
    this.state=saved&&Number.isInteger(saved.mission)&&saved.mission>=0&&saved.mission<=world.missions.length ? saved : {x:this.map.spawn.x,y:this.map.spawn.y,mission:0,started:false,carried:null,placed:[],energy:0,complete:false};
    if(!walkable(this.map,this.state.x,this.state.y,this.bridgeOpen())){this.state.x=this.map.spawn.x;this.state.y=this.map.spawn.y;}
    this.progress[world.id]=this.state;
    const root=el('div','adventure-root');root.dataset.biome=world.biome;
    const header=el('header','adventure-header');header.append(button('← Mundos',()=>{this.save();this.menu();},'adventure-quiet'),el('div','',world.name),button('Salir',()=>this.close(),'adventure-quiet'));
    const layout=el('div','adventure-layout'), stage=el('div','adventure-stage');
    this.viewW=window.matchMedia('(max-width:760px)').matches?480:960;this.viewH=this.viewW===480?360:600;
    this.canvas=el('canvas','adventure-canvas');this.canvas.id='world-canvas';this.canvas.width=this.viewW;this.canvas.height=this.viewH;this.canvas.tabIndex=0;this.canvas.setAttribute('aria-label','Mundo de exploración. Muévete con las flechas o WASD; pulsa E para interactuar.');
    this.canvas.addEventListener('click',e=>{if(this.messageOpen)return;const r=this.canvas.getBoundingClientRect();const x=Math.floor(((e.clientX-r.left)*this.viewW/r.width+this.camera.x)/TILE),y=Math.floor(((e.clientY-r.top)*this.viewH/r.height+this.camera.y)/TILE);this.path=findPath(this.map,{x:this.state.x,y:this.state.y},{x,y},this.bridgeOpen());this.canvas.focus();});
    const top=el('div','adventure-overlay');top.append(el('span','',world.subject),el('span','',this.pack.preferences.nickname));
    this.nearLabel=el('div','adventure-near');stage.append(this.canvas,top,this.nearLabel);
    const sidebar=el('aside','adventure-journal');sidebar.setAttribute('aria-label','Diario de misión');
    this.stars=el('p','adventure-kicker');this.title=el('h2');this.objective=el('p');this.inventory=el('p','adventure-inventory');
    this.status=el('p','adventure-status');this.status.setAttribute('role','status');
    const controls=el('div','adventure-controls'), pad=el('div','adventure-pad');pad.setAttribute('aria-label','Controles de movimiento');
    for(const [key,text,dir] of [['ArrowUp','↑','up'],['ArrowLeft','←','left'],['ArrowDown','↓','down'],['ArrowRight','→','right']]){
      const b=button(text,()=>this.moveKey(key),'adventure-direction '+dir);b.setAttribute('aria-label',`Mover ${ {up:'arriba',down:'abajo',left:'a la izquierda',right:'a la derecha'}[dir]}`);
      b.addEventListener('pointerdown',e=>{e.preventDefault();this.keys.add(key);this.path=[];b.setPointerCapture(e.pointerId);});
      for(const name of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(name,()=>this.keys.delete(key));pad.append(b);
    }
    this.interactButton=button('Interactuar · E',()=>this.interact(),'adventure-button adventure-action');controls.append(pad,this.interactButton);
    const tools=el('div','adventure-tools');tools.append(button('Consultar mis apuntes',()=>this.sourceDialog(),'adventure-quiet'),button('Soltar objeto',()=>{this.state.carried=null;this.say('Has dejado el objeto en su lugar de origen.');this.update();},'adventure-quiet'));
    sidebar.append(this.stars,this.title,this.objective,this.inventory,this.status,controls,tools,el('p','adventure-small','Camina hasta los personajes, objetos o el taller para interactuar. También puedes tocar un destino del mapa.'));
    this.encounter=el('section','adventure-encounter');this.encounter.hidden=true;this.encounter.setAttribute('aria-label','Encuentro');
    layout.append(stage,sidebar);root.append(header,layout,this.encounter);this.dialog.replaceChildren(root);this.canvas.focus();this.say(`Bienvenido a ${world.name}. Acércate a ${this.theme.guide}, junto al sendero.`);this.update();this.frame=requestAnimationFrame(t=>this.loop(t));
  }
  mission(){return this.world.missions[this.state.mission];}
  bridgeOpen(){return this.state.mission>=this.world.missions.findIndex(m=>m.kind==='encounter');}
  key(e,down){
    if(!this.world||this.messageOpen||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;
    const moves=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','W','A','S','D'];
    if(moves.includes(e.key)){e.preventDefault();if(down){this.keys.add(e.key);this.path=[];}else this.keys.delete(e.key);}
    if(down&&!e.repeat&&['e','E'].includes(e.key)){e.preventDefault();this.interact();}
  }
  moveKey(key){if(this.messageOpen)return;const dirs={ArrowUp:[0,-1],w:[0,-1],ArrowDown:[0,1],s:[0,1],ArrowLeft:[-1,0],a:[-1,0],ArrowRight:[1,0],d:[1,0]};const dir=dirs[key]||dirs[key.toLowerCase()];if(dir)this.move(...dir);}
  move(dx,dy){const x=this.state.x+dx,y=this.state.y+dy;if(walkable(this.map,x,y,this.bridgeOpen())){this.state.x=x;this.state.y=y;this.updatePosition();}else this.path=[];}
  loop(t){
    if(!this.world)return;
    const dt=this.lastFrame?Math.min(t-this.lastFrame,100):0;this.lastFrame=t;
    if(!document.hidden&&!this.messageOpen){this.moveClock+=dt;if(this.moveClock>=125){this.moveClock=0;const key=[...this.keys][0];if(key)this.moveKey(key);else if(this.path.length){const p=this.path.shift();this.move(p.x-this.state.x,p.y-this.state.y);if(!this.path.length)this.say('Llegaste. Pulsa Interactuar si hay un objeto cerca.');}}}
    this.draw(t);this.frame=requestAnimationFrame(time=>this.loop(time));
  }
  nearest(){
    const m=this.map, mission=this.mission();const objects=[{...m.guide,type:'guide',label:this.theme.guide},{...m.workshop,type:'workshop',label:'Taller'},{...m.guardian,type:'guardian',label:'Guardián del faro'},{...m.beacon,type:'beacon',label:'Faro'}];
    if(this.state.started&&mission&&mission.kind!=='encounter')for(let i=0;i<mission.items.length;i++){
      if(mission.kind!=='balance'&&(this.state.placed.includes(i)||this.state.carried===i))continue;
      // Deliberately distribute pieces out of reading order; their position is stable.
      const position=m.pickups[[2,0,1,3][i]];objects.push({...position,type:'pickup',index:i,label:mission.kind==='balance'?`${mission.items[i]} energía`:mission.items[i]});
    }
    return objects.map(o=>({...o,distance:Math.abs(o.x-this.state.x)+Math.abs(o.y-this.state.y)})).filter(o=>o.distance<=1).sort((a,b)=>a.distance-b.distance)[0];
  }
  updatePosition(){const near=this.nearest();this.nearLabel.textContent=near?`${near.label} · E / Interactuar`:'';this.interactButton.disabled=!near||this.messageOpen;this.canvas.dataset.position=`${this.state.x},${this.state.y}`;}
  say(text){this.status.textContent=text;}
  update(){const m=this.mission();this.stars.textContent=`${'★'.repeat(this.state.mission)}${'☆'.repeat(Math.max(0,this.world.missions.length-this.state.mission))} · ${this.state.mission}/${this.world.missions.length}`;
    this.title.textContent=this.state.complete?'¡Faro recuperado!':!this.state.started?'Un mundo por despertar':m?.title||'Enciende el faro';
    this.objective.textContent=this.state.complete?'Puedes seguir explorando o regresar al atlas para visitar otra materia.':!this.state.started?`Busca a ${this.theme.guide} para comenzar tu misión.`:m?.instruction||'Cruza el puente, llega al faro e interactúa para devolverle su luz.';
    this.inventory.textContent=m?.kind==='balance'?`Energía en el taller: ${this.state.energy}. Llevas: ${this.state.carried===null?'nada':m.items[this.state.carried]+' unidades'}.`:`Mochila: ${this.state.carried===null?'vacía':m?.items[this.state.carried]||'vacía'}${m?.kind==='order'?` · Piezas colocadas: ${this.state.placed.length}/${m.solution.length}`:''}`;
    this.updatePosition();this.save();}
  interact(){
    if(this.messageOpen)return;const target=this.nearest();if(!target)return;const m=this.mission();
    if(target.type==='guide'){
      this.talk(this.theme.guide,`Hola, ${this.pack.preferences.nickname}. Este lugar guarda ideas de tus apuntes. Recupera sus piezas, construye el paso y alcanza el faro. ${this.state.started?'Tu misión está en el diario.':'Empezaremos reconstruyendo una explicación en el taller.'}`,()=>{this.state.started=true;this.say('Misión iniciada. Busca las piezas brillantes del mapa; lleva una a la vez al taller.');this.update();});return;
    }
    if(target.type==='pickup'){
      if(this.state.carried!==null){this.say('Tu mochila ya lleva un objeto. Deposítalo en el taller o usa Soltar objeto.');return;}
      this.state.carried=target.index;this.say(`Recogiste: ${m.items[target.index]}. Llévalo al taller.`);this.update();return;
    }
    if(target.type==='workshop'){
      if(!this.state.started){this.say(`Primero habla con ${this.theme.guide}.`);return;}
      if(!m||m.kind==='encounter'){this.say('El puente está reparado. Cruza y busca al guardián del faro.');return;}
      if(this.state.carried===null){this.say('Trae una pieza del mapa para colocarla en el taller.');return;}
      const item=this.state.carried;
      if(m.kind==='balance'){
        this.state.energy+=Number(m.items[item]);this.state.carried=null;
        if(this.state.energy===m.solution[0]){this.completeMission();return;}
        if(this.state.energy>m.solution[0]){this.state.energy=0;this.say('La carga superó la cantidad necesaria. El taller se ha descargado: vuelve a calcular y prueba otra combinación.');}
        else this.say('Energía depositada. Aún falta para activar el puente.');
      }else{
        if(item!==m.solution[this.state.placed.length]){this.say('Esta pieza no encaja aquí todavía. Revisa la idea, suelta el objeto y prueba otra pieza.');return;}
        this.state.placed.push(item);this.state.carried=null;
        if(this.state.placed.length===m.solution.length){this.completeMission();return;}
        this.say('La pieza encaja. Busca la siguiente parte de la idea.');
      }this.update();return;
    }
    if(target.type==='guardian'){
      if(m?.kind==='encounter')this.question(m);
      else this.talk('Guardián',this.state.complete?'Gracias por devolver la luz a este mundo.':'El faro te espera al final del sendero.');return;
    }
    if(target.type==='beacon'){
      if(this.state.mission<this.world.missions.length){this.say('Habla con el guardián antes de encender el faro.');return;}
      this.state.complete=true;this.update();this.talk('¡Mundo recuperado!',`Has completado las ${this.world.missions.length} misiones de ${this.world.subject.toLowerCase()}. El faro vuelve a brillar. Puedes explorar otro mundo o volver a tus apuntes.`);return;
    }
  }
  completeMission(){const m=this.mission();this.state.mission++;this.state.carried=null;this.state.placed=[];this.state.energy=0;this.update();
    this.talk('★ Misión completada',m.explanation,()=>{this.say(this.mission()?.kind==='encounter'?'¡El puente ya está abierto! Cruza el río y habla con el guardián.':this.mission()?'Nueva misión: busca los objetos del mapa.':'Camina hasta el faro y enciéndelo.');this.update();});}
  showEncounter(content){this.keys.clear();this.path=[];this.messageOpen=true;this.encounter.replaceChildren(content);this.encounter.hidden=false;this.interactButton.disabled=true;content.querySelector('input,button')?.focus();}
  dismiss(){this.messageOpen=false;this.encounter.hidden=true;this.encounter.replaceChildren();this.canvas.focus();this.updatePosition();}
  talk(name,text,after=()=>{}){const c=el('div','adventure-dialogue');c.append(el('p','adventure-kicker',name),el('p','',text),button('Continuar',()=>{this.dismiss();after();}));this.showEncounter(c);}
  question(m){const c=el('div','adventure-dialogue');c.append(el('p','adventure-kicker','GUARDIÁN DEL FARO · ENCUENTRO BREVE'),el('h2','',m.instruction));
    const feedback=el('p','adventure-status');feedback.setAttribute('role','status');const form=el('form','adventure-question');
    const answer=value=>{if(normalize(value)!==normalize(m.answer)){feedback.textContent='Todavía no. Puedes consultar tus apuntes y volver a intentarlo.';return;}this.dismiss();this.completeMission();};
    if(m.items.length)for(const option of m.items)form.append(button(option,()=>answer(option)));
    else{const label=el('label','','Tu respuesta'),input=el('input');input.required=true;input.maxLength=300;input.autocomplete='off';label.append(input);const submit=el('button','adventure-button','Responder');submit.type='submit';form.append(label,submit);form.addEventListener('submit',e=>{e.preventDefault();answer(input.value);});}
    c.append(form,feedback,button('Seguir explorando',()=>this.dismiss(),'adventure-quiet'));this.showEncounter(c);}
  sourceDialog(){const c=el('div','adventure-dialogue');c.append(el('h2','','Tus apuntes en este mundo'));const refs=new Set(this.mission()?.source_ids||this.world.source_ids);
    for(const source of this.pack.sources.filter(s=>refs.has(s.id))){const detail=el('details');detail.append(el('summary','',`${source.filename}${source.page?' · página '+source.page:''}`),el('p','',source.excerpt));c.append(detail);}
    c.append(button('Volver al mundo',()=>this.dismiss()));this.showEncounter(c);}
  draw(t){
    const c=this.canvas.getContext('2d');c.imageSmoothingEnabled=false;
    const px=this.state.x*TILE+16,py=this.state.y*TILE+16;
    this.camera={x:Math.max(0,Math.min(W*TILE-this.viewW,px-this.viewW/2)),y:Math.max(0,Math.min(H*TILE-this.viewH,py-this.viewH/2))};
    c.save();c.clearRect(0,0,this.viewW,this.viewH);c.translate(-this.camera.x,-this.camera.y);terrain(c,this.map,this.theme,t,this.bridgeOpen());
    const m=this.mission();
    if(this.state.started&&m&&m.kind!=='encounter')for(let i=0;i<m.items.length;i++){
      if(m.kind!=='balance'&&(this.state.placed.includes(i)||this.state.carried===i))continue;
      const p=this.map.pickups[[2,0,1,3][i]],x=p.x*TILE+16,y=p.y*TILE+12;
      rect(c,'#fff3b622',x-15,y-13,30,30);rect(c,'#815d40',x-9,y+2,18,12);rect(c,this.theme.accent,x-8,y-6,16,13);rect(c,'#fff6dc',x-5,y-8,9,3);
      const short=m.items[i].length>27?m.items[i].slice(0,24)+'…':m.items[i];label(c,short,x,y-15);
    }
    workshop(c,this.map.workshop,this.theme);label(c,'TALLER',this.map.workshop.x*TILE+16,this.map.workshop.y*TILE-25);
    beacon(c,this.map.beacon,this.theme,this.state.complete);
    const entities=[{y:this.map.guide.y,draw:()=>{person(c,this.map.guide.x*TILE+16,this.map.guide.y*TILE+17,'#e7c579');label(c,this.theme.guide,this.map.guide.x*TILE+16,this.map.guide.y*TILE-18);}},
      {y:this.map.guardian.y,draw:()=>person(c,this.map.guardian.x*TILE+16,this.map.guardian.y*TILE+17,'#8b7caa',0,true)},
      {y:this.state.y,draw:()=>{person(c,px,py,'#b64e42',this.keys.size||this.path.length?Math.floor(t/160):0,true);if(this.state.carried!==null)rect(c,this.theme.accent,px-7,py-45,14,10);}}];
    for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(this.map.tiles[y][x]==='tree')entities.push({y,draw:()=>tree(c,x,y,this.theme,this.world.biome)});
    entities.sort((a,b)=>a.y-b.y).forEach(e=>e.draw());
    if(!this.bridgeOpen())label(c,'PUENTE POR RESTAURAR',this.map.riverX*TILE+32,this.map.bridgeY*TILE-14);
    if(this.path.length){const end=this.path[this.path.length-1];c.strokeStyle='#fff3bd';c.lineWidth=2;c.strokeRect(end.x*TILE+4,end.y*TILE+4,24,24);}
    c.restore();
  }
}
export function launchAdventure(pack,onClose){return new Adventure(pack,onClose);}
