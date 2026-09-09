import {createReadStream,statSync,existsSync} from 'node:fs';
import path from 'node:path';
import {mime} from './http.mjs';
import {HttpError} from './security.mjs';
export function serveFile(req,res,file){
 if(!existsSync(file)||!statSync(file).isFile())throw new HttpError(404,'Arquivo não encontrado.');
 const st=statSync(file),ext=path.extname(file).toLowerCase();
 res.setHeader('Content-Type',mime[ext]||'application/octet-stream');res.setHeader('Accept-Ranges','bytes');
 res.setHeader('Cache-Control',file.includes(`${path.sep}uploads${path.sep}`)?'public, max-age=31536000, immutable':'public, max-age=3600');
 if(ext==='.pdf')res.setHeader('Content-Disposition','inline');
 const range=req.headers.range;
 if(range){
  const m=/^bytes=(\d*)-(\d*)$/.exec(range);
  if(!m||(!m[1]&&!m[2])){res.writeHead(416,{'Content-Range':`bytes */${st.size}`});res.end();return;}
  let start=m[1]?Number(m[1]):Math.max(0,st.size-Number(m[2]));let end=m[1]?(m[2]?Number(m[2]):st.size-1):st.size-1;
  end=Math.min(end,st.size-1);
  if(start>end||start>=st.size){res.writeHead(416,{'Content-Range':`bytes */${st.size}`});res.end();return;}
  res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${st.size}`,'Content-Length':end-start+1});
  if(req.method==='HEAD')res.end();else createReadStream(file,{start,end}).pipe(res);return;
 }
 res.writeHead(200,{'Content-Length':st.size});if(req.method==='HEAD')res.end();else createReadStream(file).pipe(res);
}
