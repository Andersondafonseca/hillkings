"""Build an explicitly approximate 3D study of the supplied ruby-ring photographs.
Not a measured CAD, not an optical or gemological reproduction. No source images are altered.
Output: self-contained, uncompressed glTF 2.0 binary with solid PBR materials.
Python 3 standard library only.
"""
import math, struct, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PI=math.pi

def sub(a,b):return [a[i]-b[i] for i in range(3)]
def cross(a,b):return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
def norm(a):
 l=math.sqrt(sum(v*v for v in a)) or 1
 return [v/l for v in a]
def add(a,b):return [a[i]+b[i] for i in range(3)]
def mul(a,v):return [x*v for x in a]
meshes=[]

def mesh(name,verts,faces,material,smooth=False,normals=None):
 if not smooth:
  vs=[];ns=[];fs=[]
  for f in faces:
   a,b,c=[verts[i] for i in f];n=norm(cross(sub(b,a),sub(c,a)))
   fs.append([len(vs),len(vs)+1,len(vs)+2]);vs.extend([a,b,c]);ns.extend([n,n,n])
 else:
  vs=verts;fs=faces
  if normals:ns=normals
  else:
   ns=[[0,0,0] for _ in vs]
   for f in faces:
    a,b,c=[vs[i] for i in f];n=cross(sub(b,a),sub(c,a))
    for i in f:ns[i]=add(ns[i],n)
   ns=[norm(n) for n in ns]
 meshes.append({'name':name,'vertices':vs,'normals':ns,'faces':fs,'material':material})

def tube(name,points,radius=.04,material=0,segments=12,closed=False):
 vs=[];ns=[];fs=[];n=len(points)
 for i,p in enumerate(points):
  prev=points[(i-1)%n] if closed or i else points[0]
  nxt=points[(i+1)%n] if closed or i<n-1 else points[-1]
  tangent=norm(sub(nxt,prev));ref=[0,1,0] if abs(tangent[1])<.9 else [1,0,0]
  u=norm(cross(tangent,ref));v=norm(cross(tangent,u))
  for j in range(segments):
   a=j*2*PI/segments;out=add(mul(u,math.cos(a)),mul(v,math.sin(a)))
   vs.append(add(p,mul(out,radius)));ns.append(out)
 for i in range(n if closed else n-1):
  for j in range(segments):
   a=i*segments+j;b=i*segments+(j+1)%segments;c=((i+1)%n)*segments+j;d=((i+1)%n)*segments+(j+1)%segments
   fs.extend([[a,b,c],[b,d,c]])
 mesh(name,vs,fs,material,True,ns)

def sphere(name,center,rx,ry,rz,material=0,n=16,m=10):
 vs=[];ns=[];fs=[]
 for i in range(m+1):
  phi=PI*i/m
  for j in range(n):
   theta=2*PI*j/n;x=math.sin(phi)*math.cos(theta);y=math.sin(phi)*math.sin(theta);z=math.cos(phi)
   vs.append([center[0]+rx*x,center[1]+ry*y,center[2]+rz*z]);ns.append(norm([x/rx,y/ry,z/rz]))
 for i in range(m):
  for j in range(n):
   a=i*n+j;b=i*n+(j+1)%n;c=(i+1)*n+j;d=(i+1)*n+(j+1)%n
   if i:fs.append([a,c,b])
   if i<m-1:fs.append([b,c,d])
 mesh(name,vs,fs,material,True,ns)

# Circular white-metal shank. Cross section subtly flattened along the finger axis.
vs=[];ns=[];fs=[];N=128;M=16
for i in range(N):
 a=2*PI*i/N
 for j in range(M):
  b=2*PI*j/M;r=.088
  vs.append([(0.91+r*math.cos(b))*math.cos(a),r*.85*math.sin(b),-.76+(0.91+r*math.cos(b))*math.sin(a)])
  ns.append(norm([math.cos(b)*math.cos(a),math.sin(b)/.85,math.cos(b)*math.sin(a)]))
for i in range(N):
 for j in range(M):
  a=i*M+j;b=i*M+(j+1)%M;c=((i+1)%N)*M+j;d=((i+1)%N)*M+(j+1)%M
  fs.extend([[a,b,c],[b,d,c]])
mesh('White gold shank — visual approximation',vs,fs,0,True,ns)

def outline(n,sx,sy,z):
 pts=[]
 for i in range(n):
  a=2*PI*i/n
  x=sx*math.sin(a)*abs(math.sin(a))**.28;y=sy*math.cos(a)
  pts.append([x,y,z])
 return pts
# Faceted marquise ruby, crown / girdle / pavilion. Counterclockwise seen from +z.
def gem_marquise():
 n=32; table=outline(n,.274,.825,.55);top=outline(n,.495,1.18,.255);bot=outline(n,.495,1.18,.218);pav=outline(n,.272,.66,-.08)
 # reverse to get CCW as seen in front
 rings=[list(reversed(r)) for r in [table,top,bot,pav]]
 vs=[p for r in rings for p in r];vs.extend([[0,0,.55],[0,0,-.31]]);faces=[]
 for i in range(n):
  j=(i+1)%n;faces.append([4*n,i,j])
  for k in range(3):
   a=k*n+i;b=k*n+j;c=(k+1)*n+i;d=(k+1)*n+j
   faces.extend([[a,c,b],[b,c,d]])
  faces.append([3*n+i,4*n+1,3*n+j])
 mesh('Marquise ruby — approximate faceting, no measured inclusions',vs,faces,1)
gem_marquise()
# A subtle gallery follows the long stone; repeated structural loops provide visible depth.
for z,sc in [(.18,1.015),(-.04,.85)]:
 points=outline(64,.50*sc,1.185*sc,z);tube('White gold gallery rail',points,.022,closed=True)
# Tapered diamond side stones based on the frontal photograph, not measured cuts.
for sign in [-1,1]:
 outline_xy=[(.47,-.28),(.99,-.085),(1.055,-.045),(1.055,.045),(.99,.085),(.47,.28)]
 pts=[[sign*x,y,.17] for x,y in outline_xy]
 if sign<0:pts.reverse()
 cx=sign*.745
 top=[[cx+(p[0]-cx)*.79,p[1]*.74,.355] for p in pts]
 bot=[[p[0],p[1],.12] for p in pts]
 vs=top+pts+bot+[[cx,0,-.055],[cx,0,.355]];n=len(pts);faces=[]
 # Ensure the top ring is CCW in screen-space.
 area=sum(top[i][0]*top[(i+1)%n][1]-top[(i+1)%n][0]*top[i][1] for i in range(n))
 if area<0:
  top.reverse();pts.reverse();bot.reverse();vs=top+pts+bot+[[cx,0,-.055],[cx,0,.355]]
 for i in range(n):
  j=(i+1)%n;faces.append([3*n+1,i,j]);faces.extend([[i,n+i,j],[j,n+i,n+j],[n+i,2*n+i,n+j],[n+j,2*n+i,2*n+j],[2*n+i,3*n,2*n+j]])
 mesh(('Left' if sign<0 else 'Right')+' tapered side diamond',vs,faces,2)
 tube('Side-diamond white gold bezel',[[p[0],p[1],p[2]+.004] for p in pts],.027,closed=True)
 # Shoulders flow up from the shank into the side-diamond galleries.
 for y in [-.095,.095]:
  tube('Tapered shoulder',[[sign*.75,y,-.39],[sign*.92,y,-.19],[sign*1.03,y*.55,.075],[sign*1.05,y*.55,.19]],.034)
# Six crown-side prongs plus protective V tips. Geometry closely follows the available view.
for y in [-.64,.64]:
 x=.495*math.sqrt(max(0,1-(y/1.18)**2))*.98
 for sign in [-1,1]:
  tube('Crown-side prong',[[sign*(x+.065),y,-.03],[sign*(x+.055),y,.19],[sign*(x+.018),y,.31],[sign*(x-.017),y,.34]],.025)
  sphere('Rounded prong tip',[sign*(x-.018),y,.337],.043,.038,.024)
for sign in [-1,1]:
 tube('Protective V tip',[[-.13,sign*1.058,.282],[0,sign*1.20,.27],[.13,sign*1.058,.282]],.026)
 tube('Tip gallery support',[[0,sign*1.17,.19],[0,sign*.98,-.05],[0,sign*.37,-.32]],.025)

# Pack self-contained GLB 2.0.
materials=[
 {'name':'White gold — illustrative','pbrMetallicRoughness':{'baseColorFactor':[.85,.88,.86,1],'metallicFactor':1,'roughnessFactor':.16}},
 {'name':'Ruby — illustrative colour','pbrMetallicRoughness':{'baseColorFactor':[.37,.009,.102,1],'metallicFactor':.02,'roughnessFactor':.10},'extras':{'hillkingsMaterial':'ruby'}},
 {'name':'Diamond — illustrative','pbrMetallicRoughness':{'baseColorFactor':[.82,.91,.95,1],'metallicFactor':.05,'roughnessFactor':.035},'extras':{'hillkingsMaterial':'diamond'}}
]
doc={'asset':{'version':'2.0','generator':'Hillkings approximate geometry study 1.0','copyright':'Hillkings. Visual approximation from proprietor-supplied photographs.'},'scene':0,'scenes':[{'nodes':[]}],'nodes':[],'meshes':[],'materials':materials,'buffers':[{'byteLength':0}],'bufferViews':[],'accessors':[], 'extras':{'representation':'APPROXIMATE VISUAL STUDY — NOT MEASURED CAD','reference':'HK-J001 / ruby-ring photographs supplied by proprietor','limitations':'Proportions, hidden construction, cuts, inclusions and optical response are not measurements of the actual piece. Use original photos/video and gemological report.'}}
binbuf=bytearray()
def accessor(data,component,kind,minmax=False,target=None):
 global binbuf
 while len(binbuf)%4:binbuf.append(0)
 pos=len(binbuf);flat=[v for item in data for v in item] if isinstance(data[0],list) else data
 fmt='f' if component==5126 else 'I';binary=struct.pack('<'+fmt*len(flat),*flat);binbuf.extend(binary)
 bv={'buffer':0,'byteOffset':pos,'byteLength':len(binary)}
 if target:bv['target']=target
 vi=len(doc['bufferViews']);doc['bufferViews'].append(bv)
 a={'bufferView':vi,'byteOffset':0,'componentType':component,'count':len(data),'type':kind}
 if minmax:a['min']=[min(v[i] for v in data) for i in range(3)];a['max']=[max(v[i] for v in data) for i in range(3)]
 ai=len(doc['accessors']);doc['accessors'].append(a);return ai
for m in meshes:
 pos=accessor(m['vertices'],5126,'VEC3',True,34962);nor=accessor(m['normals'],5126,'VEC3',False,34962);inds=accessor([i for f in m['faces'] for i in f],5125,'SCALAR',False,34963)
 doc['meshes'].append({'name':m['name'],'primitives':[{'attributes':{'POSITION':pos,'NORMAL':nor},'indices':inds,'material':m['material'],'mode':4}]});idx=len(doc['nodes']);doc['nodes'].append({'mesh':len(doc['meshes'])-1,'name':m['name']});doc['scenes'][0]['nodes'].append(idx)
doc['buffers'][0]['byteLength']=len(binbuf)
j=json.dumps(doc,separators=(',',':'),ensure_ascii=True).encode();j+=b' '*((4-len(j)%4)%4);binbuf+=b'\0'*((4-len(binbuf)%4)%4)
out=struct.pack('<III',0x46546c67,2,12+8+len(j)+8+len(binbuf))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(binbuf),0x004e4942)+binbuf
path=ROOT/'public/models/ruby-ring.glb';path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(out)
print(f'{path}: {len(out):,} bytes, {sum(len(m["faces"]) for m in meshes):,} triangles, {len(meshes)} meshes')
