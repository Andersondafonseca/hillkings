/** Concatenate our native WebGL sources. No CDN or downloaded build dependencies. */
import {readFileSync,writeFileSync} from 'node:fs';
const parts=['gem-shaders.js','viewer-common.js','viewer-engine.js','viewer-fallback.js'];
const body=parts.map(f=>`\n// ===== ${f} =====\n`+readFileSync(new URL('../src/'+f,import.meta.url),'utf8')).join('\n');
writeFileSync(new URL('../public/assets/viewer.js',import.meta.url),body);
console.log('Viewer óptico compilado a partir de '+parts.length+' arquivos locais.');
