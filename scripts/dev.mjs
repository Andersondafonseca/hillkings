import http from 'node:http';
import handler from '../api/index.mjs';
const port=Number(process.env.PORT)||3000;
http.createServer(handler).listen(port,'127.0.0.1',()=>console.log(`Hillkings http://127.0.0.1:${port}`));
