"""Reproducible Hillkings visual studies. Not measured CAD or gemstone grading.
Requires numpy/scipy for the convex hull; generated GLBs need no runtime dependencies.
Only the loose tourmaline envelope uses the provided report dimensions. Pendant,
chain, faceting, metalwork, optical response and hidden geometry are illustrative.
"""
import math, struct, json, runpy
from pathlib import Path
import numpy as np
from scipy.spatial import ConvexHull
ROOT=Path(__file__).resolve().parents[1]
# Preserve the original approximate ring setting, replace the central gemstone.
base=runpy.run_path(str(ROOT/'scripts/build_model.py'))
mesh=base['mesh']; tube=base['tube']; sphere=base['sphere']; meshes=base['meshes']
PI=math.pi

def faceted(name,shape,width,height,depth,material,center=(0,0,0),n=24):
 def ring(count,sx,sy,z,shift=0):
  pts=[]
  for i in range(count):
   a=(i+shift)*2*PI/count
   if shape=='pear': x=math.sin(a)*(.79-.27*math.cos(a));y=math.cos(a)
   elif shape=='marquise':x=math.sin(a)*abs(math.sin(a))**.25;y=math.cos(a)
   else:x=math.sin(a);y=math.cos(a)
   pts.append([x,y,z])
  # Fixed normalization uses the full girdle width, not each individual ring.
  div=max(abs(math.sin(j*2*PI/240)*(.79-.27*math.cos(j*2*PI/240))) for j in range(240)) if shape=='pear' else 1
  return [[center[0]+p[0]/div*width/2*sx,center[1]+p[1]*height/2*sy,center[2]+z] for p in pts]
 crown=.29*depth
 pts=ring(n//2,.58,.64,crown)+ring(n,.995,1,0)+ring(n,1,1,-.027*depth)+ring(n//2,.48,.52,-.39*depth,.5)
 pts.append([center[0],center[1]-(height*.03 if shape=='pear' else 0),center[2]-.71*depth])
 arr=np.array(pts);hull=ConvexHull(arr)
 faces=[]
 for f,plane in zip(hull.simplices,hull.equations):
  a,b,c=[arr[i] for i in f]
  if np.dot(np.cross(b-a,c-a),plane[:3])<0:f=f[[0,2,1]]
  faces.append([int(i) for i in f])
 mesh(name,arr.tolist(),faces,material)

materials=[
 {'name':'White gold | polished, illustrative','pbrMetallicRoughness':{'baseColorFactor':[.94,.95,.97,1],'metallicFactor':1,'roughnessFactor':.11}},
 {'name':'Ruby | optical study','pbrMetallicRoughness':{'baseColorFactor':[.52,.013,.13,1],'metallicFactor':0,'roughnessFactor':.025},'extensions':{'KHR_materials_ior':{'ior':1.76},'KHR_materials_transmission':{'transmissionFactor':1}},'extras':{'hillkingsMaterial':'ruby'}},
 {'name':'Diamond | optical study','pbrMetallicRoughness':{'baseColorFactor':[.98,.99,1,1],'metallicFactor':0,'roughnessFactor':.018},'extensions':{'KHR_materials_ior':{'ior':2.417},'KHR_materials_transmission':{'transmissionFactor':1}},'extras':{'hillkingsMaterial':'diamond'}},
 {'name':'Paraiba tourmaline | optical study','pbrMetallicRoughness':{'baseColorFactor':[.04,.72,.68,1],'metallicFactor':0,'roughnessFactor':.027},'extensions':{'KHR_materials_ior':{'ior':1.635},'KHR_materials_transmission':{'transmissionFactor':1}},'extras':{'hillkingsMaterial':'paraiba'}}
]

def export(filename,ref,notes,dimensions=None):
 # Reduce draw calls by batching the metal parts; gemstone primitives stay separate.
 metal={'name':'White gold setting and links | approximate','vertices':[],'normals':[],'faces':[],'material':0}
 for m in meshes:
  if m['material']==0:
   off=len(metal['vertices']);metal['vertices']+=m['vertices'];metal['normals']+=m['normals'];metal['faces'] += [[i+off for i in f] for f in m['faces']]
 batch=([metal] if metal['vertices'] else [])+[m for m in meshes if m['material']!=0]
 doc={'asset':{'version':'2.0','generator':'Hillkings visual study 2.0','copyright':'Hillkings. Illustrative reconstruction; not measured CAD.'},'scene':0,'scenes':[{'nodes':[]}],'nodes':[],'meshes':[],'materials':materials,'extensionsUsed':['KHR_materials_ior','KHR_materials_transmission'],'buffers':[{'byteLength':0}],'bufferViews':[],'accessors':[], 'extras':{'representation':'ILLUSTRATIVE DIGITAL RECONSTRUCTION — NOT MEASURED CAD','reference':ref,'limitations':notes,'dimensions':dimensions}}
 buf=bytearray()
 def accessor(values,component,kind,bounds=False):
  while len(buf)%4:buf.append(0)
  flat=[v for row in values for v in row] if isinstance(values[0],list) else values
  payload=struct.pack('<'+('f' if component==5126 else 'I')*len(flat),*flat)
  bv=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':len(buf),'byteLength':len(payload)});buf.extend(payload)
  a={'bufferView':bv,'componentType':component,'count':len(values),'type':kind}
  if bounds:a.update(min=np.min(values,axis=0).tolist(),max=np.max(values,axis=0).tolist())
  idx=len(doc['accessors']);doc['accessors'].append(a);return idx
 for m in batch:
  pos=accessor(m['vertices'],5126,'VEC3',True);normal=accessor(m['normals'],5126,'VEC3');idx=accessor([i for f in m['faces'] for i in f],5125,'SCALAR')
  k=len(doc['meshes']);doc['meshes'].append({'name':m['name'],'primitives':[{'attributes':{'POSITION':pos,'NORMAL':normal},'indices':idx,'material':m['material'],'mode':4}]});doc['nodes'].append({'mesh':k,'name':m['name']});doc['scenes'][0]['nodes'].append(k)
 doc['buffers'][0]['byteLength']=len(buf)
 j=json.dumps(doc,separators=(',',':'),ensure_ascii=True).encode();j+=b' '*((-len(j))%4);buf+=b'\0'*((-len(buf))%4)
 out=struct.pack('<III',0x46546c67,2,28+len(j)+len(buf))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(buf),0x004e4942)+buf
 (ROOT/'public/models'/filename).write_bytes(out)
 print(filename,len(out),len(batch),'meshes',sum(len(m['faces']) for m in batch),'triangles')

meshes[:]=[m for m in meshes if m['material']!=1]
# Convex optical volumes for the tapered side diamonds; retain their silhouettes.
for old in list(meshes):
 if old['material']==2:
  meshes.remove(old)
  arr=np.unique(np.round(old['vertices'],7),axis=0);hull=ConvexHull(arr);faces=[]
  for f,plane in zip(hull.simplices,hull.equations):
   a,b,c=[arr[i] for i in f]
   if np.dot(np.cross(b-a,c-a),plane[:3])<0:f=f[[0,2,1]]
   faces.append([int(i) for i in f])
  mesh(old['name']+' | convex optical study',arr.tolist(),faces,2)

faceted('Marquise ruby | crown, girdle and pavilion', 'marquise',.99,2.36,.86,1,center=(0,0,.30))
export('ruby-ring.glb','HK-J001','Setting based on the supplied photographs. Faceting, hidden construction and optical properties are illustrative, not measured.')
meshes.clear()
faceted('Pear Paraiba | 10.47 x 6.59 x 4.45 mm envelope','pear',6.59,10.47,4.45,3)
export('paraiba-loose.glb','HK-G001','Dimensions follow the supplied report; facet map, colour, inclusions, birefringence and optical response are not reproduced. Do not use this model for grading.',{'lengthMm':10.47,'widthMm':6.59,'depthMm':4.45})
meshes.clear()
# Pendant silhouette is a pear with a scalloped halo and a fine chain; not a CAD.
faceted('Paraiba necklace centre | illustrative','pear',1.28,1.93,.75,3,center=(0,-.39,.16))
# 20 illustrative halo stones. Their individual sizes / count are not a factual specification.
for i in range(20):
 a=i*2*PI/20
 x=math.sin(a)*(.76-.19*math.cos(a));y=-.39+1.10*math.cos(a)
 r=.118 if math.cos(a)>.7 else .132
 faceted('Halo diamond %02d | illustrative'%(i+1),'round',r*2,r*2,.15,2,center=(x,y,.13),n=16)
 # Tiny rounded claws around halo, not oversized decorative blobs.
 for sign in [-1,1]:
  b=a+sign*.068
  sphere('Halo claw',[x+sign*.083,y+.072,.15],.026,.028,.037,n=10,m=6)
 sphere('Outer halo bead',[x*1.105,(y+.39)*1.08-.39,.10],.028,.03,.031,n=10,m=6)
# Open gallery rails, low metal behind transparent centre (no opaque face plate).
for z,k in [(.03,1),(-.17,.86)]:
 pts=[[math.sin(i*2*PI/96)*(.76-.19*math.cos(i*2*PI/96))*k,-.39+1.10*math.cos(i*2*PI/96)*k,z] for i in range(96)]
 tube('Openwork halo rail',pts,.032,segments=10,closed=True)
for a in [.54,2.1,3.65,5.74]:
 x=math.sin(a)*(.64-.17*math.cos(a));y=-.39+.96*math.cos(a)
 tube('Centre gemstone claw',[[x*1.13,y,-.12],[x*1.08,y,.18],[x*.91,y,.32]],.029,segments=10)
 sphere('Centre claw tip',[x*.91,y,.32],.037,.035,.024,n=12,m=6)
# Discrete connection bail under chain join.
pts=[[.082*math.cos(i*2*PI/40),.87+.13*math.sin(i*2*PI/40),-.015] for i in range(40)]
tube('Pendant bail',pts,.032,segments=10,closed=True)
# Two linked chain segments; necklace cropped to upper chain, not full chain length.
for side in [-1,1]:
 for j in range(30):
  t=j/29;y=.94+t*2.65;x=side*(.04+.24*t+.98*t*t);z=-.045
  tilt=.58 if j%2 else -.58;pts=[]
  # Elliptical links alternating in depth, aligned to chain tangent.
  slope=side*(.24+1.96*t)/2.65
  direction=np.array([slope,1,0]);direction/=np.linalg.norm(direction)
  cross=np.array([direction[1],-direction[0],0])*math.cos(tilt)+np.array([0,0,math.sin(tilt)])
  for k in range(16):
   a=k*2*PI/16;v=np.array([x,y,z])+direction*(.080*math.cos(a))+cross*(.040*math.sin(a));pts.append(v.tolist())
  tube('Fine interlocking chain',pts,.013,segments=7,closed=True)
export('paraiba-necklace.glb','HK-J002','Approximate pendant, halo and chain from supplied imagery. Dimensions, diamond count, chain weave, back and mount are not measured. The centre weight 2.61 ct is owner-supplied, not inferred from geometry.')
