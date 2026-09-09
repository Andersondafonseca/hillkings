
// ===== gem-shaders.js =====
/** Hillkings optical study v2. Snell refraction, Fresnel and Beer-Lambert
 * absorption traced through the convex facets. Environment-only transmission:
 * not scene path tracing, not a reconstruction of a real stone's inclusions.
 * Radiance from an analytic HDR studio, not an external photographic HDRI.
 */
const VERTEX=`
attribute vec3 aPosition; attribute vec3 aNormal;
uniform mat4 uModel; uniform mat4 uView; uniform mat4 uProjection;
varying vec3 vWorld; varying vec3 vNormal; varying vec3 vLocal; varying vec3 vLocalNormal;
void main(){vec4 w=uModel*vec4(aPosition,1.0);vWorld=w.xyz;vNormal=normalize(mat3(uModel)*aNormal);vLocal=aPosition;vLocalNormal=aNormal;gl_Position=uProjection*uView*w;}
`;
const FRAGMENT=`
precision highp float;
varying vec3 vWorld; varying vec3 vNormal; varying vec3 vLocal; varying vec3 vLocalNormal;
uniform mat4 uModel;
uniform vec3 uEye; uniform vec3 uEyeLocal; uniform vec3 uColor;
uniform float uMetallic; uniform float uRoughness; uniform float uGem;
uniform float uWarm; uniform float uExposure; uniform float uLightAngle;
uniform float uGemScale; uniform int uPlaneCount; uniform int uBounces;
uniform vec4 uPlanes[144];
const float PI=3.14159265359;
vec3 fresnel(float c,vec3 f){return f+(1.0-f)*pow(clamp(1.0-c,0.0,1.0),5.0);}
float fresnelDielectric(float c,float n1,float n2){
 c=clamp(c,0.0,1.0);float eta=n1/n2;float st2=eta*eta*(1.0-c*c);if(st2>=1.0)return 1.0;
 float ct=sqrt(1.0-st2);float rs=(n1*c-n2*ct)/max(n1*c+n2*ct,0.0001);
 float rp=(n1*ct-n2*c)/max(n1*ct+n2*c,0.0001);return .5*(rs*rs+rp*rp);
}
float panel(vec3 d,vec3 position,vec2 size){
 vec3 p=normalize(position);float facing=dot(d,p);if(facing<=0.0)return 0.0;
 vec3 r=normalize(cross(p,vec3(0.0,1.0,.003)));vec3 up=cross(r,p);
 vec2 q=abs(vec2(dot(d,r),dot(d,up))/max(facing,.01));
 return (1.0-smoothstep(size.x*.88,size.x,q.x))*(1.0-smoothstep(size.y*.9,size.y,q.y));
}
vec3 studio(vec3 direction){
 float co=cos(uLightAngle),si=sin(uLightAngle);
 vec3 d=vec3(co*direction.x-si*direction.z,direction.y,si*direction.x+co*direction.z);
 vec3 c=vec3(.09,.105,.10)+vec3(.15,.16,.17)*max(d.y,0.0);
 c+=vec3(.16,.17,.17)*pow(max(-d.y,0.0),.6);
 c+=vec3(2.6,2.7,2.85)*panel(d,vec3(-.65,.45,1.0),vec2(.24,.64));
 c+=vec3(3.9,3.75,3.5)*panel(d,vec3(.88,.28,.75),vec2(.065,.62));
 c+=vec3(2.6,2.9,3.2)*panel(d,vec3(.10,1.0,-.3),vec2(.7,.26));
 c+=vec3(2.7,2.9,2.85)*panel(d,vec3(-.22,.10,-1.0),vec2(.42,.54));
 c+=vec3(1.8,1.85,1.95)*panel(d,vec3(-1.0,-.1,-.2),vec2(.1,.50));
 c+=vec3(.6,.72,.75)*panel(d,vec3(.45,-.65,-.7),vec2(.4,.13));
 if(uWarm>.5)c*=vec3(1.15,.96,.72);
 if(uWarm<-.5)c*=vec3(.82,.99,1.17);
 return c;
}
vec3 worldDirection(vec3 d){return normalize(mat3(uModel)*d);}
float nextFacet(vec3 pos,vec3 dir,out vec3 normal){
 float hit=1.e8;normal=vec3(0.0,0.0,1.0);
 for(int i=0;i<144;i++){
  if(i>=uPlaneCount)break;
  vec4 plane=uPlanes[i];float denom=dot(plane.xyz,dir);
  if(denom>0.00001){float t=-(dot(plane.xyz,pos)+plane.w)/denom;
   if(t>uGemScale*.000002&&t<hit){hit=t;normal=plane.xyz;}}
 }
 return hit;
}
vec3 traceGem(float ior,vec3 absorption){
 vec3 n=normalize(vLocalNormal);vec3 incoming=normalize(vLocal-uEyeLocal);
 if(dot(incoming,n)>0.0)n=-n;
 float front=fresnelDielectric(max(-dot(incoming,n),0.0),1.0,ior);
 vec3 result=front*studio(worldDirection(reflect(incoming,n)));
 vec3 dir=refract(incoming,n,1.0/ior);
 if(dot(dir,dir)<.1)return result;
 vec3 pos=vLocal+dir*uGemScale*.00008;vec3 energy=vec3(1.0-front);
 if(uPlaneCount==0){return result+energy*exp(-absorption*.65)*studio(worldDirection(dir));}
 for(int step=0;step<8;step++){
  if(step>=uBounces)break;
  vec3 face;float travel=nextFacet(pos,dir,face);
  if(travel>1.e7)break;
  energy*=exp(-absorption*travel/max(uGemScale,.0001));
  pos+=dir*travel;
  vec3 outgoing=refract(dir,-face,ior);
  float f=fresnelDielectric(max(dot(dir,face),0.0),ior,1.0);
  if(dot(outgoing,outgoing)>.0001){result+=energy*(1.0-f)*studio(worldDirection(outgoing));energy*=f;}
  dir=reflect(dir,face);pos+=dir*uGemScale*.00008;
  if(max(energy.r,max(energy.g,energy.b))<.002)break;
 }
 return result;
}
float ggx(float nh,float r){float a=r*r;float a2=a*a;float d=nh*nh*(a2-1.0)+1.0;return a2/max(PI*d*d,.00001);}
float geom(float nv,float r){float k=(r+1.0)*(r+1.0)/8.0;return nv/(nv*(1.0-k)+k);}
vec3 light(vec3 n,vec3 v,vec3 l,vec3 intensity,vec3 base,float metal,float rough){
 vec3 h=normalize(v+l);float nl=max(dot(n,l),0.0),nv=max(dot(n,v),.001),nh=max(dot(n,h),0.0),hv=max(dot(h,v),0.0);
 vec3 f=fresnel(hv,mix(vec3(.04),base,metal));
 return ((1.0-f)*(1.0-metal)*base/PI+ggx(nh,rough)*geom(nv,rough)*geom(nl,rough)*f/max(4.0*nv*nl,.001))*intensity*nl;
}
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.0,1.0);}
void main(){
 vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;
 vec3 v=normalize(uEye-vWorld),r=reflect(-v,n);vec3 base=pow(uColor,vec3(2.2));
 float rough=clamp(uRoughness,.035,.9);vec3 c;
 if(uGem>.5){
  if(uGem<1.5)c=traceGem(1.76,vec3(.40,4.8,2.4));
  else if(uGem<2.5){
   vec3 a=traceGem(2.402,vec3(.009,.006,.002));
   vec3 b=traceGem(2.417,vec3(.009,.006,.002));
   vec3 d=traceGem(2.442,vec3(.009,.006,.002));
   c=vec3(a.r,b.g,d.b);
  }else c=traceGem(1.635,vec3(3.5,.31,.23));
 }else{
  vec3 f=fresnel(max(dot(n,v),0.0),mix(vec3(.045),base,uMetallic));
  c=studio(r)*f*(1.0-rough*.6);
  c+=light(n,v,normalize(vec3(-3.,5.,5.)-vWorld),vec3(.9),base,uMetallic,rough);
  c+=light(n,v,normalize(vec3(4.,1.,1.)-vWorld),vec3(.45),base,uMetallic,rough);
  c+=(1.0-uMetallic)*base*.17;
 }
 c=aces(c*uExposure);c=pow(max(c,0.0),vec3(1.0/2.2));
 gl_FragColor=vec4(c,1.0);
}
`;


// ===== viewer-common.js =====
const I=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function mul(a,b){const r=new Array(16).fill(0);for(let c=0;c<4;c++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)r[c*4+row]+=a[k*4+row]*b[c*4+k];return r;}
function translation(x,y,z){const m=I();m[12]=x;m[13]=y;m[14]=z;return m;}
function scale(x,y=x,z=x){return [x,0,0,0,0,y,0,0,0,0,z,0,0,0,0,1];}
function rotX(a){const c=Math.cos(a),s=Math.sin(a);return [1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1];}
function rotY(a){const c=Math.cos(a),s=Math.sin(a);return [c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1];}
function perspective(fov,aspect,near=.1,far=100){const f=1/Math.tan(fov/2),nf=1/(near-far);return [f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0];}
function trs(n){
 if(n.matrix)return n.matrix;
 const [x,y,z,w]=n.rotation||[0,0,0,1],x2=x+x,y2=y+y,z2=z+z;
 const m=[1-(y*y2+z*z2),x*y2+w*z2,x*z2-w*y2,0,x*y2-w*z2,1-(x*x2+z*z2),y*z2+w*x2,0,x*z2+w*y2,y*z2-w*x2,1-(x*x2+y*y2),0,0,0,0,1];
 const s=n.scale||[1,1,1],t=n.translation||[0,0,0];return mul(translation(...t),mul(m,scale(...s)));
}
function transformPoint(m,x,y,z){return [m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];}
function normalMatrix(m){
 const a=m[0],b=m[4],c=m[8],d=m[1],e=m[5],f=m[9],g=m[2],h=m[6],i=m[10];const det=a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);if(Math.abs(det)<1e-12)return [1,0,0,0,1,0,0,0,1];
 return [(e*i-f*h)/det,(c*h-b*i)/det,(b*f-c*e)/det,(f*g-d*i)/det,(a*i-c*g)/det,(c*d-a*f)/det,(d*h-e*g)/det,(b*g-a*h)/det,(a*e-b*d)/det];
}
function transformNormal(m,x,y,z){const a=m[0]*x+m[3]*y+m[6]*z,b=m[1]*x+m[4]*y+m[7]*z,c=m[2]*x+m[5]*y+m[8]*z,l=Math.hypot(a,b,c)||1;return [a/l,b/l,c/l];}
function computeNormals(pos,idx){const n=new Float32Array(pos.length);for(let k=0;k<idx.length;k+=3){const a=idx[k]*3,b=idx[k+1]*3,c=idx[k+2]*3;const ux=pos[b]-pos[a],uy=pos[b+1]-pos[a+1],uz=pos[b+2]-pos[a+2],vx=pos[c]-pos[a],vy=pos[c+1]-pos[a+1],vz=pos[c+2]-pos[a+2];const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;for(const j of [a,b,c]){n[j]+=nx;n[j+1]+=ny;n[j+2]+=nz;}}for(let k=0;k<n.length;k+=3){const l=Math.hypot(n[k],n[k+1],n[k+2])||1;n[k]/=l;n[k+1]/=l;n[k+2]/=l;}return n;}
const component={5120:{size:1,get:'getInt8'},5121:{size:1,get:'getUint8'},5122:{size:2,get:'getInt16'},5123:{size:2,get:'getUint16'},5125:{size:4,get:'getUint32'},5126:{size:4,get:'getFloat32'}};
async function parseGlb(url,signal){
 const response=await fetch(url,{signal});if(!response.ok)throw Error('Model not found');const buffer=await response.arrayBuffer();
 if(buffer.byteLength>60*1024*1024)throw Error('Model exceeds 60 MB');
 const view=new DataView(buffer);if(view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2)throw Error('Invalid GLB');
 let doc,binOffset=0,binLength=0;
 for(let off=12;off+8<=buffer.byteLength;){const length=view.getUint32(off,true),type=view.getUint32(off+4,true);if(off+8+length>buffer.byteLength)throw Error('Truncated GLB');if(type===0x4e4f534a)doc=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,off+8,length)).trim());if(type===0x004e4942){binOffset=off+8;binLength=length;}off+=8+length;}
 if(!doc||!binOffset)throw Error('Missing GLB data');
 if(doc.buffers?.some(b=>b.uri)||doc.images?.some(i=>i.uri))throw Error('External GLB dependencies are not supported');
 if((doc.extensionsRequired||[]).some(x=>/draco|meshopt/i.test(x)))throw Error('Compressed geometry is not supported');
 function accessor(id){const a=doc.accessors[id];if(!a||a.sparse)throw Error('Unsupported accessor');const bv=doc.bufferViews[a.bufferView],c=component[a.componentType],width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type];if(!bv||!c||!width||a.count>1000000)throw Error('Unsupported geometry');const stride=bv.byteStride||c.size*width,base=binOffset+(bv.byteOffset||0)+(a.byteOffset||0);if(base+(a.count-1)*stride+width*c.size>binOffset+binLength)throw Error('Buffer outside bounds');const values=new Float32Array(a.count*width);for(let i=0;i<a.count;i++)for(let j=0;j<width;j++){let val=view[c.get](base+i*stride+j*c.size,true);if(a.normalized){if(a.componentType===5120)val=Math.max(-1,val/127);if(a.componentType===5121)val/=255;if(a.componentType===5122)val=Math.max(-1,val/32767);if(a.componentType===5123)val/=65535;}values[i*width+j]=val;}return values;}
 const primitives=[];const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];let vertexCount=0;
 function visit(index,parent,ancestry){if(ancestry.has(index))throw Error('Invalid node cycle');const node=doc.nodes[index];if(!node)return;const ancestors=new Set(ancestry);ancestors.add(index);const matrix=mul(parent,trs(node)),nm=normalMatrix(matrix);
  if(node.mesh!==undefined)for(const p of doc.meshes[node.mesh].primitives){if((p.mode??4)!==4)continue;if(p.extensions?.KHR_draco_mesh_compression)throw Error('Compressed mesh not supported');const original=accessor(p.attributes.POSITION),pos=new Float32Array(original.length);vertexCount+=original.length/3;if(vertexCount>1500000)throw Error('Geometry is too complex');for(let k=0;k<original.length;k+=3){const v=transformPoint(matrix,original[k],original[k+1],original[k+2]);pos.set(v,k);for(let c=0;c<3;c++){min[c]=Math.min(min[c],v[c]);max[c]=Math.max(max[c],v[c]);}}const idx=p.indices!==undefined?Uint32Array.from(accessor(p.indices)):Uint32Array.from({length:pos.length/3},(_,i)=>i);if(idx.length%3!==0||Array.from(idx).some(i=>i>=pos.length/3))throw Error('Invalid triangle indices');let normals;
   if(p.attributes.NORMAL!==undefined){const raw=accessor(p.attributes.NORMAL);normals=new Float32Array(raw.length);for(let k=0;k<raw.length;k+=3)normals.set(transformNormal(nm,raw[k],raw[k+1],raw[k+2]),k);}else normals=computeNormals(pos,idx);
   const material=doc.materials?.[p.material]||{},pbr=material.pbrMetallicRoughness||{};if(pbr.baseColorTexture)throw Error('Textured materials are not supported in this solid-material viewer');
   const materialName=(material.name||'').toLowerCase(),color=(pbr.baseColorFactor||[.7,.75,.7,1]).slice(0,3);
   const gem=material.extras?.hillkingsMaterial==='ruby'||/ruby|rubi/.test(materialName)?1:material.extras?.hillkingsMaterial==='diamond'||/diamond|diamant/.test(materialName)?2:material.extras?.hillkingsMaterial==='paraiba'||/paraiba|paraíba|tourmaline|turmalina/.test(materialName)?3:0;
   primitives.push({pos,normals,idx,color,name:node.name||materialName,metallic:pbr.metallicFactor??1,roughness:pbr.roughnessFactor??.3,gem});
  }
  for(const child of node.children||[])visit(child,matrix,ancestors);
 }
 for(const n of doc.scenes?.[doc.scene||0]?.nodes||[])visit(n,I(),new Set());
 if(!primitives.length||!Number.isFinite(min[0]))throw Error('No renderable meshes');
 return {primitives,center:min.map((v,i)=>(v+max[i])/2),size:Math.max(...max.map((v,i)=>v-min[i]))};
}


// ===== viewer-engine.js =====
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


// ===== viewer-fallback.js =====
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
