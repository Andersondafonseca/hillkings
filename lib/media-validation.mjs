import {HttpError,requireField} from './security.mjs';
export function uploadExtension(buf){
 if(buf.length>=8&&buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return '.png';
 if(buf.length>=3&&buf[0]===255&&buf[1]===216&&buf[2]===255)return '.jpg';
 if(buf.length>=12&&buf.toString('ascii',0,4)==='RIFF'&&buf.toString('ascii',8,12)==='WEBP')return '.webp';
 if(buf.toString('ascii',0,5)==='%PDF-')return '.pdf';
 if(buf.length>=12&&buf.toString('ascii',4,8)==='ftyp')return '.mp4';
 if(buf.length>=12&&buf.toString('ascii',0,4)==='glTF'&&buf.readUInt32LE(4)===2&&buf.readUInt32LE(8)===buf.length)return '.glb';
 throw new HttpError(415,'Formato não permitido. Use JPEG, PNG, WebP, MP4, PDF ou GLB 2.0.');
}
export function validateGlb(buf){
 try{
  const n=buf.readUInt32LE(12);if(n>8*1024*1024||20+n>buf.length||buf.toString('ascii',16,20)!=='JSON')throw Error();
  const d=JSON.parse(buf.toString('utf8',20,20+n).trim());
  requireField(!d.buffers?.some(b=>b.uri)&&!d.images?.some(i=>i.uri),'O GLB precisa ser autocontido, sem arquivos externos.');
  requireField(!(d.extensionsRequired||[]).some(x=>/draco|meshopt/i.test(x)),'Exporte o GLB sem compressão Draco ou Meshopt.');
  requireField(!d.materials?.some(m=>m.pbrMetallicRoughness?.baseColorTexture),'Este visualizador usa materiais sólidos. Exporte o CAD sem texturas de cor.');
  requireField((d.accessors||[]).reduce((sum,a)=>sum+(a.count||0),0)<5000000,'Modelo 3D muito complexo. Otimize a malha antes do envio.');
 }catch(e){if(e instanceof HttpError)throw e;throw new HttpError(400,'GLB inválido ou não suportado.');}
}
