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
