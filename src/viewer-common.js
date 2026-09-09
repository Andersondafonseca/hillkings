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
