// Copia la interfaz de ORI (la misma del escritorio) a www/ y ajusta las rutas para Android.
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const www = join(raiz, 'www');
const ui = join(raiz, '..', 'escritorio', 'renderer');
const nm = join(raiz, 'node_modules');

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
cpSync(ui, www, { recursive: true });

// Librerías 3D (solo lo necesario)
cpSync(join(nm, 'three', 'build'), join(www, 'lib/three/build'), { recursive: true });
for (const f of ['loaders/GLTFLoader.js', 'utils/BufferGeometryUtils.js']) {
  cpSync(join(nm, 'three/examples/jsm', f), join(www, 'lib/three/examples/jsm', f));
}
cpSync(join(nm, '@pixiv/three-vrm/lib'), join(www, 'lib/three-vrm'), { recursive: true });

// Avatar VRM opcional
const vrm = join(raiz, '..', 'escritorio', 'avatar', 'nova.vrm');
if (existsSync(vrm)) cpSync(vrm, join(www, 'avatar', 'nova.vrm'));

// Rutas del importmap + hash de seguridad (CSP)
let html = readFileSync(join(www, 'index.html'), 'utf8');
html = html
  .replaceAll('../node_modules/three/build/', './lib/three/build/')
  .replaceAll('../node_modules/three/examples/jsm/', './lib/three/examples/jsm/')
  .replaceAll('../node_modules/@pixiv/three-vrm/lib/', './lib/three-vrm/');
const mapa = html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1];
const hash = createHash('sha256').update(mapa).digest('base64');
html = html.replace(/'sha256-[^']+'/, `'sha256-${hash}'`);
writeFileSync(join(www, 'index.html'), html);

console.log('✔ Interfaz de ORI lista en movil/www');
