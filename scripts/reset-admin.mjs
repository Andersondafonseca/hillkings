/** Run locally on the server host; never exposed as a public HTTP route. */
import {hashPassword,validPassword} from '../lib/security.mjs';
const username=process.env.ADMIN_INITIAL_USERNAME||'admin';
const password=process.env.ADMIN_INITIAL_PASSWORD;
if(!password||!validPassword(password))throw new Error('Defina ADMIN_INITIAL_PASSWORD com uma senha exclusiva de 12 a 128 caracteres.');
if(!/^[a-zA-Z0-9_.-]{3,40}$/.test(username))throw new Error('ADMIN_INITIAL_USERNAME inválido.');
// Permit this local maintenance command to repair an insecure bootstrap account.
// The HTTP server's production-startup protection is unchanged.
process.env.NODE_ENV='development';
const {db,init}=await import('../lib/database.mjs');
await init();
db.prepare('UPDATE users SET username=?, password_hash=?, must_change=0, insecure_bootstrap=0 WHERE id=(SELECT id FROM users LIMIT 1)').run(username,await hashPassword(password));
db.prepare('DELETE FROM sessions').run();db.close();
console.log('Administrador atualizado e sessões anteriores encerradas.');
