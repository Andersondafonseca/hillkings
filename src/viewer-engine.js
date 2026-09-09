function shader(gl,type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const error=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error(error);}return s;}
function program(gl){const vs=shader(gl,gl.VERTEX_SHADER,VERTEX),fs=shader(gl,gl.FRAGMENT_SHADER,FRAGMENT),p=gl.createProgram();gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;}
/** Recover the convex facet planes from the actual triangle mesh. A nonconvex or
 * overly detailed uploaded stone uses a simple optical fallback, not false facets. */
function facetPlanes(mesh){
 const {pos,idx}=mesh,lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
 for(let k=0;k<pos.length;k+=3)for(let j=0;j<3;j++){lo[j]=Math.min(lo[j],pos[k+j]);hi[j]=Math.max(hi[j],pos[k+j]);}
 const center=lo.map((n,j)=>(n+hi[j])/2),size=Math.max(...hi.map((n,j)=>n-lo[j]));
 const planes=[],seen=new Set();
 for(let k=0;k<idx.length;k+=3){
  const a=idx[k]*3,b=idx[k+1]*3,c=idx[k+2]*3;
  const u=[pos[b]-pos[a],pos[b+1]-pos[a+1],pos[b+2]-pos[a+2]],v=[pos[c]-pos[a],pos[c+1]-pos[a+1],pos[c+2]-pos[a+2]];
  let n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=Math.hypot(...n);if(len<1e-10)continue;n=n.map(x=>x/len);
  let d=-(n[0]*pos[a]+n[1]*pos[a+1]+n[2]*pos[a+2]);
  if(n.reduce((s,x,j)=>s+x*center[j],d)>0){n=n.map(x=>-x);d=-d;}
  const key=n.map(x=>Math.round(x*20000)).join(',')+','+Math.round(d/size*20000);
  if(seen.has(key))continue;seen.add(key);planes.push([...n,d]);
 }
 // Validate convexity before using nearest-plane intersections.
 let valid=planes.length<=144;
 if(valid)for(const p of planes){for(let k=0;k<pos.length;k+=3)if(p[0]*pos[k]+p[1]*pos[k+1]+p[2]*pos[k+2]+p[3]>size*.0003){valid=false;break;}if(!valid)break;}
 const data=new Float32Array(144*4);if(valid)planes.forEach((p,i)=>data.set(p,i*4));
 return {planeData:data,planeCount:valid?planes.length:0,gemScale:size};
}
export async function mountViewer(element,{lang='pt'}={}){
 if(element._hillkingsViewer)return element._hillkingsViewer;
 const testCanvas=document.createElement('canvas');let testGL=testCanvas.getContext('webgl',{antialias:true});
 if(!testGL||testGL.getParameter(testGL.MAX_FRAGMENT_UNIFORM_VECTORS)<170){testGL?.getExtension('WEBGL_lose_context')?.loseContext();return mountSoftwareViewer(element,{lang});}
 testGL.getExtension('WEBGL_lose_context')?.loseContext();testGL=null;
 return mountOpticalViewer(element,{lang});
}
async function mountOpticalViewer(element,{lang='pt'}={}){
 if(element._hillkingsViewer)return element._hillkingsViewer;
 let destroyed=false,initialized=false,raf=0,observer,ro;
 const canvas=element.querySelector('canvas'),controller=new AbortController(),listeners=[];
 const on=(el,type,fn,opt)=>{el.addEventListener(type,fn,opt);listeners.push([el,type,fn,opt]);};
 let gl,prog,gpu=[],uniforms={},locations={},center=[0,0,0],modelScale=1;
 let yaw=-.24,pitch=.12,distance=4.6,warm=0,exposure=.95,lightAngle=0,last=0,visible=true,dirty=true;
 let auto=false,velocityX=0,velocityY=0,pinch=0,slowFrames=0,frames=0,qualityScale=1;
 const pointers=new Map(),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const maxDpr=Math.min(devicePixelRatio||1,innerWidth<700?1.45:1.8);
 const api={destroy(){destroyed=true;controller.abort();cancelAnimationFrame(raf);observer?.disconnect();ro?.disconnect();for(const [e,t,f,o]of listeners)e.removeEventListener(t,f,o);if(gl){gpu.forEach(m=>[m.vertex,m.normal,m.index].forEach(b=>gl.deleteBuffer(b)));if(prog)gl.deleteProgram(prog);gl.getExtension('WEBGL_lose_context')?.loseContext();}delete element._hillkingsViewer;},pause(){auto=false;velocityX=velocityY=0;updateAuto();queue();},refresh(){visible=true;resize();queue();}};
 element._hillkingsViewer=api;
 const autoButton=element.querySelector('[data-viewer-action="auto"]');
 function updateAuto(){autoButton?.setAttribute('aria-pressed',String(auto));autoButton?.classList.toggle('is-active',auto);if(autoButton)autoButton.querySelector('span').textContent=lang==='pt'?(auto?'Pausar rotação':'Rotação automática'):(auto?'Pause rotation':'Automatic rotation');}
 function queue(){dirty=true;if(!raf&&!destroyed)raf=requestAnimationFrame(frame);}
 function resize(){if(!gl)return;const r=canvas.getBoundingClientRect(),dpr=maxDpr*qualityScale;const w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(r.height*dpr));if(w!==canvas.width||h!==canvas.height){canvas.width=w;canvas.height=h;dirty=true;}queue();}
 function frame(time){
  raf=0;if(destroyed)return;const dt=Math.min((time-(last||time))/1000,.05);last=time;if(!visible||document.hidden)return;
  if(auto&&!pointers.size){yaw+=dt*.12;dirty=true;}
  if(!pointers.size&&!reduced&&(Math.abs(velocityX)+Math.abs(velocityY)>.0002)){yaw+=velocityX;pitch=Math.max(-1.50,Math.min(1.50,pitch+velocityY));velocityX*=.89;velocityY*=.89;dirty=true;}
  if(dirty&&initialized){const start=performance.now();draw();dirty=false;const cost=performance.now()-start;frames++;if(cost>42)slowFrames++;if(frames===45&&slowFrames>22&&qualityScale>.72){qualityScale=.72;resize();element.dataset.quality='adaptive';}}
  if(initialized&&(auto||Math.abs(velocityX)+Math.abs(velocityY)>.0002))raf=requestAnimationFrame(frame);
 }
 function draw(){
  gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(prog);
  const rotation=mul(rotX(pitch),rotY(yaw));const m=mul(rotation,mul(scale(modelScale),translation(-center[0],-center[1],-center[2])));
  const eyeRot=transformPoint(mul(rotY(-yaw),rotX(-pitch)),0,0,distance);const eyeLocal=eyeRot.map((n,i)=>center[i]+n/modelScale);
  gl.uniformMatrix4fv(uniforms.uModel,false,new Float32Array(m));gl.uniformMatrix4fv(uniforms.uView,false,new Float32Array(translation(0,0,-distance)));gl.uniformMatrix4fv(uniforms.uProjection,false,new Float32Array(perspective(35*Math.PI/180,canvas.width/canvas.height,.04,100)));
  gl.uniform3f(uniforms.uEye,0,0,distance);gl.uniform3fv(uniforms.uEyeLocal,eyeLocal);gl.uniform1f(uniforms.uWarm,warm);gl.uniform1f(uniforms.uExposure,exposure);gl.uniform1f(uniforms.uLightAngle,lightAngle);gl.uniform1i(uniforms.uBounces,innerWidth<700?5:8);
  for(const mesh of gpu){
   gl.bindBuffer(gl.ARRAY_BUFFER,mesh.vertex);gl.enableVertexAttribArray(locations.aPosition);gl.vertexAttribPointer(locations.aPosition,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,mesh.normal);gl.enableVertexAttribArray(locations.aNormal);gl.vertexAttribPointer(locations.aNormal,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.index);
   gl.uniform3fv(uniforms.uColor,mesh.color);gl.uniform1f(uniforms.uMetallic,mesh.metallic);gl.uniform1f(uniforms.uRoughness,mesh.roughness);gl.uniform1f(uniforms.uGem,mesh.gem);gl.uniform1i(uniforms.uPlaneCount,mesh.planeCount||0);gl.uniform1f(uniforms.uGemScale,mesh.gemScale||1);if(mesh.planeCount)gl.uniform4fv(uniforms.uPlanes,mesh.planeData);gl.drawElements(gl.TRIANGLES,mesh.count,mesh.indexType,0);
  }
  canvas.dataset.yaw=yaw.toFixed(3);canvas.dataset.zoom=distance.toFixed(2);canvas.dataset.light=String(warm);canvas.dataset.exposure=exposure.toFixed(2);canvas.dataset.renderCount=String((Number(canvas.dataset.renderCount)||0)+1);
 }
 function zoom(f){distance=Math.min(10,Math.max(2.15,distance*f));queue();}
 function reset(){yaw=-.24;pitch=.12;distance=4.6;velocityX=velocityY=0;auto=false;updateAuto();queue();}
 on(canvas,'pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});auto=false;velocityX=velocityY=0;updateAuto();if(pointers.size===2){const[a,b]=[...pointers.values()];pinch=Math.hypot(a.x-b.x,a.y-b.y);}queue();});
 on(canvas,'pointermove',e=>{const old=pointers.get(e.pointerId);if(!old)return;const cur={x:e.clientX,y:e.clientY};if(pointers.size===1){velocityX=(cur.x-old.x)*.006;velocityY=(cur.y-old.y)*.005;yaw+=velocityX;pitch=Math.max(-1.50,Math.min(1.50,pitch+velocityY));}pointers.set(e.pointerId,cur);if(pointers.size===2){const[a,b]=[...pointers.values()],d=Math.hypot(a.x-b.x,a.y-b.y);if(pinch&&d)zoom(pinch/d);pinch=d;}queue();});
 for(const type of ['pointerup','pointercancel','lostpointercapture'])on(canvas,type,e=>{pointers.delete(e.pointerId);pinch=0;if(type==='pointercancel')velocityX=velocityY=0;queue();});
 on(canvas,'wheel',e=>{e.preventDefault();zoom(Math.exp(e.deltaY*.0007));},{passive:false});
 on(canvas,'keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','=','r','R'].includes(e.key))return;e.preventDefault();auto=false;updateAuto();if(e.key==='ArrowLeft')yaw-=.12;if(e.key==='ArrowRight')yaw+=.12;if(e.key==='ArrowUp')pitch=Math.max(-1.50,pitch-.1);if(e.key==='ArrowDown')pitch=Math.min(1.50,pitch+.1);if(e.key==='+'||e.key==='=')zoom(.86);if(e.key==='-')zoom(1.16);if(e.key.toLowerCase()==='r')reset();queue();});
 on(canvas,'dblclick',()=>zoom(.76));
 for(const b of element.querySelectorAll('[data-viewer-action]'))on(b,'click',async()=>{switch(b.dataset.viewerAction){case'zoom-in':zoom(.85);break;case'zoom-out':zoom(1.15);break;case'macro':zoom(.73);break;case'reset':reset();break;case'auto':auto=!auto;velocityX=velocityY=0;updateAuto();break;case'light':warm=warm===0?1:warm===1?-1:0;b.querySelector('span:last-child').textContent=lang==='pt'?(warm===0?'Luz de estúdio':warm===1?'Luz quente':'Luz fria'):(warm===0?'Studio light':warm===1?'Warm light':'Cool light');break;case'fullscreen':try{if(document.fullscreenElement)await document.exitFullscreen();else if(element.requestFullscreen)await element.requestFullscreen();else element.classList.toggle('viewer-expanded');}catch{element.classList.toggle('viewer-expanded');}resize();break;}queue();});
 const light=element.querySelector('[data-light-angle]');if(light)on(light,'input',()=>{lightAngle=Number(light.value)*Math.PI/180;queue();});
 const exp=element.querySelector('[data-exposure]');if(exp)on(exp,'input',()=>{exposure=Number(exp.value);queue();});
 on(document,'visibilitychange',()=>{last=0;if(!document.hidden)queue();});on(document,'fullscreenchange',resize);on(document,'keydown',e=>{if(e.key==='Escape'&&element.classList.contains('viewer-expanded')){e.preventDefault();element.classList.remove('viewer-expanded');resize();}});
 on(canvas,'webglcontextlost',e=>{e.preventDefault();if(!destroyed)fail(lang==='pt'?'A sessão gráfica foi interrompida. Reabra a experiência 3D.':'Graphics session interrupted. Reopen the 3D experience.');});
 function fail(msg){auto=false;velocityX=velocityY=0;element.dataset.state='error';element.classList.add('failed');const el=element.querySelector('.viewer-error');el.hidden=false;el.textContent=msg;}
 async function initialize(){
  if(initialized||destroyed||element.dataset.state==='loading')return;element.dataset.state='loading';
  try{
   gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false,powerPreference:'high-performance',preserveDrawingBuffer:false});if(!gl)throw Error('WebGL unavailable');gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);
   prog=program(gl);for(const n of ['uModel','uView','uProjection','uEye','uEyeLocal','uColor','uMetallic','uRoughness','uGem','uWarm','uExposure','uLightAngle','uGemScale','uPlaneCount','uBounces'])uniforms[n]=gl.getUniformLocation(prog,n);uniforms.uPlanes=gl.getUniformLocation(prog,'uPlanes[0]');for(const n of ['aPosition','aNormal'])locations[n]=gl.getAttribLocation(prog,n);
   const model=await parseGlb(element.dataset.model,controller.signal);if(destroyed)return;center=model.center;modelScale=2.40/model.size;
   // Focus on the pendant first while keeping the complete illustrative chain in the model.
   if(element.dataset.product==='HK-J002'){const gems=model.primitives.filter(m=>m.gem===3);if(gems.length){let cy=0,n=0;for(const g of gems)for(let k=1;k<g.pos.length;k+=3){cy+=g.pos[k];n++;}center[1]=cy/n+.26;modelScale=.80;}}
   const uint=gl.getExtension('OES_element_index_uint');
   for(const m of model.primitives){const make=(t,d)=>{const b=gl.createBuffer();gl.bindBuffer(t,b);gl.bufferData(t,d,gl.STATIC_DRAW);return b;};let max=0;for(const i of m.idx)max=Math.max(max,i);const use32=max>65535;if(use32&&!uint)throw Error('Index format not supported');const idx=use32?m.idx:Uint16Array.from(m.idx);gpu.push({...m,...(m.gem?facetPlanes(m):{}),vertex:make(gl.ARRAY_BUFFER,m.pos),normal:make(gl.ARRAY_BUFFER,m.normals),index:make(gl.ELEMENT_ARRAY_BUFFER,idx),count:idx.length,indexType:use32?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT});}
   initialized=true;element.dataset.state='ready';element.dataset.renderer='webgl-optical';element.classList.add('ready');canvas.dataset.triangles=String(gpu.reduce((n,m)=>n+m.count/3,0));canvas.dataset.meshes=String(gpu.length);canvas.dataset.refractiveMeshes=String(gpu.filter(m=>m.planeCount>0).length);canvas.dataset.maxFacetPlanes=String(Math.max(...gpu.map(m=>m.planeCount||0)));resize();updateAuto();queue();
  }catch(e){if(destroyed||e.name==='AbortError')return;console.warn('Hillkings optical viewer:',e.message);fail(lang==='pt'?'Este dispositivo não conseguiu abrir a renderização. Consulte as imagens e os vídeos reais.':'This device could not initialize the renderer. View original photographs and footage.');}
 }
 ro=new ResizeObserver(resize);ro.observe(canvas);observer=new IntersectionObserver(entries=>{visible=entries.some(e=>e.isIntersecting);if(visible){last=0;initialize();queue();}},{threshold:.01});observer.observe(element);if(element.dataset.lazy==='false')initialize();return api;
}
