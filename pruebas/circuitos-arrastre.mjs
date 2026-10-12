// Circuitos en el constructor, arrastrando:
//   · soltar un ejercicio EN MEDIO de otro suelto crea una superserie;
//   · en medio de uno que ya está en un circuito, entra a ese circuito;
//   · sacarlo deja el circuito con uno solo → el circuito se deshace;
//   · un circuito se arrastra ENTERO (antes o después de otro ejercicio);
//   · ⤓ manda un ejercicio al final (dentro de su circuito, al final de él).
//   NODE_PATH=/ruta/node_modules node pruebas/circuitos-arrastre.mjs
import { createRequire } from 'module';
const require_ = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require_('playwright')); }
catch { console.error('Falta playwright (npm i -D playwright, o NODE_PATH=…)'); process.exit(2); }
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const p = await b.newPage();
const errores = [];
p.on('pageerror', e => errores.push(e.message));
await p.goto('file://' + import.meta.dirname + '/arnes/rutina.html');

const r = await p.evaluate(async () => {
  const out = [];
  const ok = (n, c, extra = '') => out.push(`${c ? '✔' : '✘'} ${n}${c ? '' : ' ' + extra}`);
  const BORRADOS = [];
  let nuevos = 0;
  entDb.actualizarRE = async () => {};
  entDb.quitarRE = async () => true;
  window.entRefrescarAsistencia = () => {};
  entDb.borrarBloque = async (id) => { BORRADOS.push(id); };
  entDb.crearBloque = async (row) => ({ id: 'bn' + (++nuevos), ...row });
  const pintar = () => { document.getElementById('ent-body').innerHTML = entRenderRutina(_ent.rutina); };
  const fila = (id) => document.querySelector(`.ent-fila[data-re="${id}"]`);
  const dt = () => ({ effectAllowed: '', dropEffect: '', setData() {}, getData() { return ''; } });
  const ev = (tipo, extra = {}) => Object.assign(new Event(tipo, { bubbles: true, cancelable: true }), { dataTransfer: dt() }, extra);
  const soltar = async (desde, sobre, rel, deBloque = false) => {
    const a = deBloque ? document.querySelector(`[data-bloque="${desde}"] [data-bloque-agarre]`) : fila(desde);
    const e1 = ev('dragstart'); Object.defineProperty(e1, 'currentTarget', { value: a });
    deBloque ? entBloqueDragStart(e1) : entReDragStart(e1);
    const f = fila(sobre), caja = f.getBoundingClientRect();
    const e2 = ev('drop', { clientY: caja.top + caja.height * rel });
    Object.defineProperty(e2, 'currentTarget', { value: f }); Object.defineProperty(e2, 'target', { value: f });
    await entReDrop(e2);
    pintar();
  };
  const orden = () => _ent.rutina.ejercicios.map(x => `${x.id}${x.bloque_id ? '@' + x.bloque_id : ''}`).join(' ');

  // Marca al pasar por el medio.
  const a1 = fila('re1');
  const e1 = ev('dragstart'); Object.defineProperty(e1, 'currentTarget', { value: a1 }); entReDragStart(e1);
  const f2 = fila('re2'), c2 = f2.getBoundingClientRect();
  const o = ev('dragover', { clientY: c2.top + c2.height / 2 }); Object.defineProperty(o, 'currentTarget', { value: f2 }); Object.defineProperty(o, 'target', { value: f2 });
  entReDragOver(o);
  ok('en medio de otro se marca «juntar en circuito»', f2.classList.contains('ent-fila-juntar'));
  const end = ev('dragend'); Object.defineProperty(end, 'currentTarget', { value: a1 }); entReDragEnd(end);

  // 1. Press banca (suelto) en medio de Press militar (suelto) → superserie.
  await soltar('re1', 're2', 0.5);
  const bn = _ent.rutina.bloques.find(x => x.id === 'bn1');
  ok('crea una superserie con los dos', orden() === 're2@bn1 re1@bn1 re3@b1 re4@b1' && bn && bn.tipo === 'superserie' && bn.vueltas === 3, orden() + ' ' + JSON.stringify(bn));
  ok('y la pinta como bloque', !!document.querySelector('[data-bloque="bn1"]'));

  // 2. Sacar Press banca al hueco de arriba (suelto) → bn1 queda con uno y se deshace.
  {
    const a = fila('re1');
    const e1 = ev('dragstart'); Object.defineProperty(e1, 'currentTarget', { value: a }); entReDragStart(e1);
    const h = document.querySelector('.ent-hueco[data-pos="0"]');
    const e2 = ev('drop'); Object.defineProperty(e2, 'currentTarget', { value: h }); Object.defineProperty(e2, 'target', { value: h });
    await entHuecoDrop(e2);
    pintar();
  }
  await new Promise(r => setTimeout(r, 30));
  ok('al sacarlo, el circuito con uno solo se deshace', orden() === 're1 re2 re3@b1 re4@b1' && BORRADOS.includes('bn1') && !_ent.rutina.bloques.some(x => x.id === 'bn1'), orden() + ' ' + JSON.stringify(BORRADOS));

  // 3. Press militar en medio de Fondos (que está en el circuito b1) → entra a b1.
  await soltar('re2', 're3', 0.5);
  ok('en medio de uno de un circuito: entra a ese circuito (al final)', orden() === 're1 re3@b1 re4@b1 re2@b1', orden());

  // 4. Mover el circuito entero antes de Press banca.
  await soltar('b1', 're1', 0.1, true);
  ok('el circuito se arrastra entero', orden() === 're3@b1 re4@b1 re2@b1 re1', orden());

  // 5. ⤓ al final: dentro del circuito, al final de él; el circuito, al final de todo.
  await entAlFinal('re3'); pintar();
  ok('⤓ dentro del circuito lo deja último del circuito', orden() === 're4@b1 re2@b1 re3@b1 re1', orden());
  await entBloqueAlFinal('b1'); pintar();
  ok('⤓ del circuito lo manda al final de la rutina', orden() === 're1 re4@b1 re2@b1 re3@b1', orden());
  ok('hay ⤓ en cada ejercicio y en el circuito', document.querySelectorAll('[data-al-final]').length === 4 && document.querySelectorAll('[data-bloque-al-final]').length === 1);

  // 6. Quitar con la ✕ hasta dejar uno: también se deshace.
  await entQuitarRE('re4'); await entQuitarRE('re2'); pintar();
  ok('con la ✕, si queda uno solo, el circuito se deshace', BORRADOS.includes('b1') && _ent.rutina.ejercicios.find(x => x.id === 're3').bloque_id === null, JSON.stringify(BORRADOS));
  return out;
});
r.forEach(l => console.log(l));
await new Promise(r => setTimeout(r, 200));
if (errores.length) console.log('PAGEERROR:', errores.join(' | '));
await b.close();
const mal = r.filter(l => l.startsWith('✘')).length + errores.length;
console.log(mal ? `\n${mal} FALLOS` : '\ncircuitos ok');
process.exit(mal ? 1 : 0);
