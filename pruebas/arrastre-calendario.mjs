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
await p.goto('file://' + import.meta.dirname + '/arnes/cal.html');

const r = await p.evaluate(async () => {
  const out = [];
  const ok = (n, c, extra='') => out.push(`${c ? '✔' : '✘'} ${n}${c ? '' : ' ' + extra}`);

  let escrituras = [];
  entDb.actualizarRutina = async (id, row) => { escrituras.push([id, row]); };
  window.entVistaClientes = async () => {};

  const celda = (f) => document.querySelector(`.ent-celda[data-fecha="${f}"]`);
  const chip  = (id) => document.querySelector(`.ent-chip-rutina[data-rutina="${id}"]`);
  const dt = () => ({ effectAllowed:'', dropEffect:'', setData(){}, getData(){return '';} });
  const ev = (t, extra={}) => Object.assign(new Event(t,{bubbles:true,cancelable:true}), { dataTransfer: dt() }, extra);

  const soltar = async (rutinaId, fechaDestino) => {
    escrituras = [];
    const c = chip(rutinaId), d = celda(fechaDestino);
    const e1 = ev('dragstart'); Object.defineProperty(e1,'currentTarget',{value:c}); entCalDragStart(e1);
    const e2 = ev('drop');
    Object.defineProperty(e2,'currentTarget',{value:d});
    Object.defineProperty(e2,'target',{value:d});
    await entCalDrop(e2);
    return escrituras;
  };

  // --- el arrastre se anuncia ---
  const c1 = chip('r1');
  const e1 = ev('dragstart'); Object.defineProperty(e1,'currentTarget',{value:c1}); entCalDragStart(e1);
  ok('dragstart guarda la rutina', _ent.arrastrando === 'r1', `(${_ent.arrastrando})`);
  ok('la rejilla se marca', !!document.querySelector('.ent-mes-arrastrando'));

  const libre = celda('2026-10-15');   // jueves dentro de la fase, sin rutina
  const over = ev('dragover');
  Object.defineProperty(over,'currentTarget',{value:libre});
  Object.defineProperty(over,'target',{value:libre});
  entCalDragOver(over);
  ok('el día destino se resalta', libre.classList.contains('ent-celda-destino'));

  const fuera = celda('2026-10-02');   // antes de que empiece la fase
  const over2 = ev('dragover');
  Object.defineProperty(over2,'currentTarget',{value:fuera});
  Object.defineProperty(over2,'target',{value:fuera});
  entCalDragOver(over2);
  ok('fuera de la fase NO se puede soltar',
     !fuera.classList.contains('ent-celda-destino') && !over2.defaultPrevented);

  const end = ev('dragend'); Object.defineProperty(end,'currentTarget',{value:c1}); entCalDragEnd(end);
  ok('dragend limpia', !_ent.arrastrando && !document.querySelector('.ent-celda-destino,.ent-mes-arrastrando'));

  // --- mover a un día libre ---
  let w = await soltar('r1', '2026-10-15');   // Push (lunes) → jueves
  ok('mover a día libre fija el día', w.length === 1 && w[0][0] === 'r1' && w[0][1].dia_semana === 'J',
     JSON.stringify(w));

  // --- soltar donde ya hay otra: intercambio ---
  w = await soltar('r1', '2026-10-16');       // Push (L) sobre Lower (V)
  const porId = Object.fromEntries(w.map(([id,row]) => [id, row.dia_semana]));
  ok('día ocupado → se intercambian', w.length === 2 && porId.r1 === 'V' && porId.r3 === 'L',
     JSON.stringify(porId));

  // --- arrastrar una "sugerida" la fija ---
  w = await soltar('r2', '2026-10-17');       // Pull (sin día fijo) → sábado
  ok('arrastrar una sugerida la fija', w.length === 1 && w[0][1].dia_semana === 'S', JSON.stringify(w));

  // --- soltar en su propio día no escribe ---
  w = await soltar('r1', '2026-10-19');       // Push ya es lunes
  ok('soltar en su mismo día no escribe', w.length === 0, JSON.stringify(w));

  // --- soltar fuera de la fase no escribe ---
  w = await soltar('r1', '2026-10-02');
  ok('soltar fuera de la fase no escribe', w.length === 0, JSON.stringify(w));

  return out;
});

r.forEach(l => console.log(l));
if (errores.length) console.log('PAGEERROR:', errores.join(' | '));
await b.close();
const mal = r.filter(l => l.startsWith('✘')).length + errores.length;
console.log(mal ? `\n${mal} FALLOS` : '\narrastre del calendario ok');
process.exit(mal ? 1 : 0);
