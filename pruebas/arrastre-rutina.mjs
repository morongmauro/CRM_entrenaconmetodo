// Playwright puede no estar instalado en este repo (no es dependencia de la
// app, solo de esta prueba). Se resuelve a mano para poder decir qué falta en
// vez de soltar un ERR_MODULE_NOT_FOUND pelado.
import { createRequire } from 'module';
const require_ = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require_('playwright'));
} catch {
  console.error('Falta playwright. Instálalo con:  npm i -D playwright');
  console.error('Si ya lo tienes en otro sitio:    NODE_PATH=/ruta/node_modules node ' + process.argv[1]);
  process.exit(2);
}
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const p = await b.newPage();
const errores = [];
p.on('pageerror', e => errores.push(e.message));
await p.goto('file://' + import.meta.dirname + '/arnes/rutina.html');

const r = await p.evaluate(() => {
  const out = [];
  const ok = (n, c, extra='') => out.push(`${c ? '✔' : '✘'} ${n}${c ? '' : ' ' + extra}`);

  // Espiar la base: nos interesa QUÉ se escribiría, no escribirlo.
  let escrituras = [];
  entDb.actualizarRE = async (id, parche) => { escrituras.push([id, parche]); };
  entPintarConstructor = async () => {};
  window.entPintarConstructor = entPintarConstructor;

  const filas = () => [...document.querySelectorAll('.ent-fila')];
  const dt = () => ({ effectAllowed:'', dropEffect:'', setData(){}, getData(){return '';} });
  const ev = (tipo, extra={}) => Object.assign(new Event(tipo, {bubbles:true, cancelable:true}), { dataTransfer: dt() }, extra);

  const arrastrar = (desdeIdx, hastaIdx, mitadSuperior) => {
    escrituras = [];
    const a = filas()[desdeIdx], b2 = filas()[hastaIdx];
    const e1 = ev('dragstart'); Object.defineProperty(e1,'currentTarget',{value:a}); entReDragStart(e1);
    const caja = b2.getBoundingClientRect();
    const y = caja.top + (mitadSuperior ? caja.height*0.2 : caja.height*0.8);
    const e2 = ev('drop', { clientY: y });
    Object.defineProperty(e2,'currentTarget',{value:b2});
    Object.defineProperty(e2,'target',{value:b2});
    entReDrop(e2);
    return escrituras;
  };

  // --- indicador visual al pasar por encima ---
  const a0 = filas()[0], b1 = filas()[2];
  const e1 = ev('dragstart'); Object.defineProperty(e1,'currentTarget',{value:a0}); entReDragStart(e1);
  ok('dragstart marca la fila', a0.classList.contains('ent-fila-arrastre'));
  ok('dragstart guarda el id', _ent.arrastrandoRE === a0.dataset.re, `(${_ent.arrastrandoRE})`);

  const caja = b1.getBoundingClientRect();
  const over = ev('dragover', { clientY: caja.top + 2 });
  Object.defineProperty(over,'currentTarget',{value:b1});
  Object.defineProperty(over,'target',{value:b1});
  entReDragOver(over);
  ok('mitad de arriba → línea ANTES', b1.classList.contains('ent-fila-antes'));

  const over2 = ev('dragover', { clientY: caja.bottom - 2 });
  Object.defineProperty(over2,'currentTarget',{value:b1});
  Object.defineProperty(over2,'target',{value:b1});
  entReDragOver(over2);
  ok('mitad de abajo → línea DESPUÉS',
     b1.classList.contains('ent-fila-despues') && !b1.classList.contains('ent-fila-antes'));

  const end = ev('dragend'); Object.defineProperty(end,'currentTarget',{value:a0}); entReDragEnd(end);
  ok('dragend limpia todo',
     !document.querySelector('.ent-fila-antes,.ent-fila-despues,.ent-fila-arrastre') && !_ent.arrastrandoRE);

  // --- reordenar de verdad ---
  let w = arrastrar(0, 3, false);     // re1 al final
  const ordenes = Object.fromEntries(w.map(([id,p2]) => [id, p2.orden]).filter(([,o]) => o != null));
  ok('re1 al final queda 4º', ordenes.re1 === 4, JSON.stringify(ordenes));
  ok('los de en medio suben', ordenes.re2 === 1 && ordenes.re3 === 2 && ordenes.re4 === 3, JSON.stringify(ordenes));
  ok('hereda el bloque del destino', w.find(([id]) => id==='re1')?.[1].bloque_id === 'b1',
     JSON.stringify(w.find(([id]) => id==='re1')));

  w = arrastrar(3, 0, true);          // re4 al principio, fuera del circuito
  const p4 = w.find(([id]) => id==='re4')?.[1];
  ok('re4 al principio queda 1º', p4?.orden === 1, JSON.stringify(p4));
  ok('sale del circuito (bloque null)', p4 && p4.bloque_id === null, JSON.stringify(p4));

  // --- soltar en el bloque vacío ---
  escrituras = [];
  const vacio = [...document.querySelectorAll('.ent-bloque')].find(x => x.dataset.bloque === 'b2');
  const e3 = ev('dragstart'); Object.defineProperty(e3,'currentTarget',{value:filas()[0]}); entReDragStart(e3);
  const drop = ev('drop');
  Object.defineProperty(drop,'currentTarget',{value:vacio});
  Object.defineProperty(drop,'target',{value:vacio});
  entBloqueDrop(drop);
  ok('soltar en bloque vacío le pone el bloque',
     escrituras.length === 1 && escrituras[0][1].bloque_id === 'b2', JSON.stringify(escrituras));

  // --- soltar sobre sí mismo no hace nada ---
  escrituras = [];
  const f0 = filas()[0];
  const e4 = ev('dragstart'); Object.defineProperty(e4,'currentTarget',{value:f0}); entReDragStart(e4);
  const d4 = ev('drop', { clientY: f0.getBoundingClientRect().top + 5 });
  Object.defineProperty(d4,'currentTarget',{value:f0});
  Object.defineProperty(d4,'target',{value:f0});
  entReDrop(d4);
  ok('soltar sobre sí mismo no escribe nada', escrituras.length === 0, JSON.stringify(escrituras));

  return out;
});

r.forEach(l => console.log(l));
if (errores.length) console.log('PAGEERROR:', errores.join(' | '));
await b.close();
const mal = r.filter(l => l.startsWith('✘')).length + errores.length;
console.log(mal ? `\n${mal} FALLOS` : '\narrastre ok');
process.exit(mal ? 1 : 0);
