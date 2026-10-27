// /tailwind.css está al día: recompila con tailwind.config.cjs y compara.
// Si falla, usaste una clase de Tailwind nueva: recompila con el comando que
// sale abajo y súbelo junto con tu cambio.
//
//   node pruebas/tailwind-al-dia.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const RAIZ = path.join(import.meta.dirname, '..');
const salida = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tw-')), 'tailwind.css');
const args = ['--yes', 'tailwindcss@3.4.17', '-c', 'tailwind.config.cjs', '-i', 'estilos-tailwind.css', '-o', salida, '--minify'];
try {
  execFileSync('npx', args, { cwd: RAIZ, stdio: 'pipe' });
} catch (e) {
  console.error('No pude correr Tailwind (npx tailwindcss@3.4.17):', String(e.stderr || e.message).slice(0, 300));
  process.exit(2);
}
const igual = fs.readFileSync(salida, 'utf8') === fs.readFileSync(path.join(RAIZ, 'tailwind.css'), 'utf8');
console.log(`  ${igual ? 'ok ' : 'MAL'}  tailwind.css tiene todas las clases que usa el CRM`);
if (!igual) console.log(`\n  Recompila:  npx ${args.slice(1, -2).join(' ')} -o tailwind.css --minify`);
console.log(igual ? '\ntodo bien' : '\n1 falla(s)');
process.exit(igual ? 0 : 1);
