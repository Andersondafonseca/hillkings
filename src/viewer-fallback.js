async function mountSoftwareViewer(element,{lang='pt'}={}){
 if(element._hillkingsViewer)return element._hillkingsViewer;
 const canvas=element.querySelector('canvas'),ctx=canvas.getContext('2d',{alpha:true});
 element.querySelector('.viewer-tuning')?.setAttribute('hidden','');
 let dead=false,yaw=-.36,pitch=.17,distance=4.6,warm=false,auto=false;
 let model=null,raf=0,last=0,visible=true,observer,ro,pinch=0;
 const controller=new AbortController(),listeners=[],pointers=new Map();
 const on=(target,type,fn,options)=>{target.addEventListener(type,fn,options);listeners.push([target,type,fn,options]);};
 const api={destroy(){dead=true;controller.abort();cancelAnimationFrame(raf);observer?.disconnect();ro?.disconnect();for(const [t,k,f,o] of listeners)t.removeEventListener(k,f,o);delete element._hillkingsViewer;},pause(){auto=false;update();queue();},refresh(){visible=true;resize();queue();}};
 element._hillkingsViewer=api;
 const autoButton=element.querySelector('[data-viewer-action="auto"]');
 function update(){if(autoButton){autoButton.setAttribute('aria-pressed',String(auto));autoButton.querySelector('span').textContent=lang==='pt'?(auto?'Pausar rotação':'Rotação automática'):(auto?'Pause rotation':'Automatic rotation');}}
 function queue(){if(!raf&&!dead)raf=requestAnimationFrame(drawFrame);}
 function resize(){const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.max(1,Math.round(r.width*dpr));canvas.height=Math.max(1,Math.round(r.height*dpr));queue();}
 function zoom(f){distance=Math.max(2.7,Math.min(11,distance*f));queue();}
 function drawFrame(time){raf=0;if(dead||!model||!visible||document.hidden)return;if(auto&&!pointers.size){yaw+=Math.min((time-(last||time))/1000,.05)*.13;}last=time;draw();if(auto)raf=requestAnimationFrame(drawFrame);}
 function draw(){
  if(!ctx)return;const w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);
  const rotation=mul(rotX(pitch),rotY(yaw)),base=mul(rotation,mul(scale(2.35/model.size),translation(-model.center[0],-model.center[1],-model.center[2])));
  const focal=h/(2*Math.tan(35*Math.PI/360)),faces=[];
  for(const mesh of model.primitives){
   const points=new Float32Array(mesh.pos.length),normals=new Float32Array(mesh.normals.length);
   for(let i=0;i<mesh.pos.length;i+=3){const q=transformPoint(base,mesh.pos[i],mesh.pos[i+1],mesh.pos[i+2]);points.set(q,i);const n=transformPoint(rotation,mesh.normals[i],mesh.normals[i+1],mesh.normals[i+2]);normals.set(n,i);}
   for(let j=0;j<mesh.idx.length;j+=3){
    const a=mesh.idx[j]*3,b=mesh.idx[j+1]*3,c=mesh.idx[j+2]*3;
    const za=distance-points[a+2],zb=distance-points[b+2],zc=distance-points[c+2];if(Math.min(za,zb,zc)<=.1)continue;
    const screen=[w/2+focal*points[a]/za,h/2-focal*points[a+1]/za,w/2+focal*points[b]/zb,h/2-focal*points[b+1]/zb,w/2+focal*points[c]/zc,h/2-focal*points[c+1]/zc];
    if(screen.every((v,k)=>k%2?v<0:v<0))continue;
    let nx=(normals[a]+normals[b]+normals[c])/3,ny=(normals[a+1]+normals[b+1]+normals[c+1])/3,nz=(normals[a+2]+normals[b+2]+normals[c+2])/3;
    const norm=Math.hypot(nx,ny,nz)||1;nx/=norm;ny/=norm;nz/=norm;
    if(nz<0){nx=-nx;ny=-ny;nz=-nz;}
    const key=Math.max(0,-.36*nx+.73*ny+.57*nz),rim=Math.max(0,.85*nx+.17*ny+.5*nz),glint=Math.pow(Math.max(0,-.2*nx+.35*ny+.916*nz),28);
    let color;
    if(mesh.gem===1||mesh.gem===3){const facet=.32+key*.9+rim*.25;const flash=glint*.14;color=mesh.color.map((v,k)=>Math.min(1,v*facet*.5+flash*(k===1?.08:.25)));}
    else if(mesh.gem===2){const factor=.30+key*.48+rim*.23+glint*.7;color=[factor*.93,factor*.98,factor];}
    else{const factor=.15+key*.65+rim*.25+glint*.8;color=mesh.color.map(v=>Math.min(1,v*factor));}
    if(warm)color=color.map((v,k)=>v*[1.04,.97,.84][k]);
    const rgb=color.map(v=>Math.round(255*Math.sqrt(Math.min(1,Math.max(0,v)))));
    faces.push({depth:(za+zb+zc)/3,screen,fill:`rgb(${rgb.join(',')})`});
   }
  }
  faces.sort((a,b)=>b.depth-a.depth);
  for(const face of faces){const a=face.screen;ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(a[2],a[3]);ctx.lineTo(a[4],a[5]);ctx.closePath();ctx.fillStyle=face.fill;ctx.fill();ctx.strokeStyle=face.fill;ctx.lineWidth=.4;ctx.stroke();}
  canvas.dataset.yaw=yaw.toFixed(3);canvas.dataset.zoom=distance.toFixed(2);
 }
 on(canvas,'pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});auto=false;update();if(pointers.size===2){const[a,b]=[...pointers.values()];pinch=Math.hypot(a.x-b.x,a.y-b.y);}});
 on(canvas,'pointermove',e=>{const before=pointers.get(e.pointerId);if(!before)return;const now={x:e.clientX,y:e.clientY};if(pointers.size===1){yaw+=(now.x-before.x)*.008;pitch=Math.max(-1.48,Math.min(1.48,pitch+(now.y-before.y)*.007));}pointers.set(e.pointerId,now);if(pointers.size===2){const[a,b]=[...pointers.values()],d=Math.hypot(a.x-b.x,a.y-b.y);if(pinch&&d)zoom(pinch/d);pinch=d;}queue();});
 for(const event of ['pointerup','pointercancel'])on(canvas,event,e=>{pointers.delete(e.pointerId);pinch=0;});
 on(canvas,'wheel',e=>{e.preventDefault();zoom(Math.exp(e.deltaY*.001));},{passive:false});
 on(canvas,'keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','=','r','R'].includes(e.key))return;e.preventDefault();auto=false;update();if(e.key==='ArrowLeft')yaw-=.15;if(e.key==='ArrowRight')yaw+=.15;if(e.key==='ArrowUp')pitch-=.12;if(e.key==='ArrowDown')pitch+=.12;pitch=Math.max(-1.48,Math.min(1.48,pitch));if(['+','='].includes(e.key))zoom(.9);if(e.key==='-')zoom(1.1);if(e.key.toLowerCase()==='r'){yaw=-.36;pitch=.17;distance=4.6;}queue();});
 for(const button of element.querySelectorAll('[data-viewer-action]'))on(button,'click',()=>{switch(button.dataset.viewerAction){case'zoom-in':zoom(.84);break;case'zoom-out':zoom(1.16);break;case'reset':yaw=-.36;pitch=.17;distance=4.6;break;case'auto':auto=!auto;update();break;case'fullscreen':element.requestFullscreen?.();break;case'macro':zoom(.70);break;case'light':warm=!warm;button.querySelector('span:last-child').textContent=lang==='pt'?(warm?'Luz suave':'Luz de estúdio'):(warm?'Soft light':'Studio light');break;}queue();});
 on(document,'visibilitychange',()=>{last=0;if(!document.hidden)queue();});
 observer=new IntersectionObserver(entries=>{visible=entries.some(e=>e.isIntersecting);if(visible)queue();},{threshold:.01});observer.observe(element);
 ro=new ResizeObserver(resize);ro.observe(canvas);
 element.dataset.state='loading';
 try{
  if(!ctx)throw new Error('Canvas unavailable');model=await parseGlb(element.dataset.model,controller.signal);if(dead)return api;
  element.dataset.state='ready';element.dataset.renderer='software';element.querySelector('.viewer-optics').textContent=lang==='pt'?'Modo compatível · sem refração':'Compatibility · no refraction';element.classList.add('ready');canvas.dataset.triangles=String(model.primitives.reduce((n,m)=>n+m.idx.length/3,0));canvas.dataset.meshes=String(model.primitives.length);
  const tag=element.querySelector('.viewer-tag');tag.title='Renderização simplificada de compatibilidade. Geometria 3D real; materiais ilustrativos.';
  const note=element.querySelector('.viewer-bottom small');note.textContent+=(lang==='pt'?' Modo compatível: renderização simplificada.':' Compatibility mode: simplified rendering.');
  resize();update();queue();
 }catch(error){if(!dead){element.dataset.state='error';element.classList.add('failed');const message=element.querySelector('.viewer-error');message.hidden=false;message.textContent=lang==='pt'?'Este dispositivo não conseguiu abrir a representação. Consulte as fotografias e o vídeo reais.':'This device could not open the representation. View original photos and footage.';console.warn('Hillkings compatibility viewer:',error.message);}}
 return api;
}
