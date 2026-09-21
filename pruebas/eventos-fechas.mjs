// Las TRES implementaciones de "en qué días cae este evento" tienen que dar
// lo mismo:
//   · evtFechasDe()      — CRM (eventos.js), para pintar el calendario
//   · evento_fechas()    — SQL, la fuente para cualquier consulta
//   · expandirEventos()  — API del cliente (mealtracker/api/training.js)
//
// Si se separan, el coach ve la natación un lunes y al cliente le aparece
// otro día. No hay nada que lo avise solo: cada lado parece correcto.
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import vm from 'vm';

const raiz = import.meta.dirname + '/..';

function trozo(ruta, desde, hasta) {
  const src = readFileSync(ruta, 'utf8');
  const i = src.indexOf(desde), j = src.indexOf(hasta, i);
  if (i < 0 || j < 0) throw new Error(`no encuentro el trozo de ${ruta} — ¿lo moviste?`);
  return src.slice(i, j);
}

// ── CRM ──
const ctxCrm = vm.createContext({ console });
vm.runInContext(
  trozo(`${raiz}/entrenamiento.js`, '// ---------- Fechas, en local ----------',
                                    '// En qué semana de la fase estamos hoy')
  + trozo(`${raiz}/eventos.js`, '// En qué días concretos cae un evento.',
                                '// =====================================================\n// CAPA DE DATOS')
  + '\nglobalThis.evtFechasDe = evtFechasDe;', ctxCrm);
const evtFechasDe = ctxCrm.evtFechasDe;

// ── API del cliente ──
const api = `${raiz}/../mealtracker/api/training.js`;
const ctxApi = vm.createContext({ console });
vm.runInContext(
  "const DIAS = ['L','M','X','J','V','S','D'];\n"
  + trozo(api, 'function expandirEventos(', '\n// ════')
  + '\nglobalThis.expandirEventos = expandirEventos;', ctxApi);
const expandirEventos = ctxApi.expandirEventos;

const psql = (sql, db = 'evtest') =>
  execFileSync('psql', ['-h', '/tmp', '-U', 'postgres', '-d', db, '-tAc', sql],
    { encoding: 'utf8', env: { ...process.env, PATH: process.env.PATH + ':/usr/lib/postgresql/16/bin' } });

const fase = {
  id: '22222222-0000-0000-0000-000000000001',
  fecha_inicio: '2026-10-05', semanas: 4, visible_cliente: true,
};
const casos = [
  ['Natación L+X, todas las semanas', '33333333-0000-0000-0000-000000000001',
   { id: 'e1', fase_id: fase.id, dias_semana: ['L', 'X'], semanas: null, visible_cliente: null }],
  ['Medición V, semanas 1 y 4', '33333333-0000-0000-0000-000000000002',
   { id: 'e2', fase_id: fase.id, dias_semana: ['V'], semanas: [1, 4], visible_cliente: null }],
  ['Cita suelta', '33333333-0000-0000-0000-000000000003',
   { id: 'e3', fecha: '2026-10-20', visible_cliente: null }],
];

let fallos = 0;
const ok = (n, c, extra = '') => { if (!c) fallos++; console.log(`${c ? '✔' : '✘'} ${n}${c ? '' : ' ' + extra}`); };

for (const [nombre, id, ev] of casos) {
  const js = evtFechasDe(ev, ev.fecha ? null : fase);
  const sql = psql(`select fecha from evento_fechas('${id}') order by 1`).trim().split('\n').filter(Boolean);
  // La cita suelta no tiene fase_id, así que en el API hereda de la fase
  // abierta; el CRM la resuelve igual.
  const apiMapa = expandirEventos([ev], fase);
  const apiDias = Object.keys(apiMapa).sort();

  ok(`${nombre} · CRM = SQL`, JSON.stringify(js) === JSON.stringify(sql), `\n   js ${js}\n   sql ${sql}`);
  ok(`${nombre} · API = SQL`, JSON.stringify(apiDias) === JSON.stringify(sql), `\n   api ${apiDias}\n   sql ${sql}`);
}

console.log('--- bordes (solo JS: el SQL no puede expresarlos) ---');
const bordes = [
  ['sin fase y sin fecha', evtFechasDe({ dias_semana: ['L'] }, null), []],
  ['fase sin fecha_inicio', evtFechasDe({ dias_semana: ['L'] }, { semanas: 4 }), []],
  ['día inventado', evtFechasDe({ dias_semana: ['Z'] }, fase), []],
  ['semana fuera de rango', evtFechasDe({ dias_semana: ['L'], semanas: [9] }, fase), []],
];
for (const [n, got, esperado] of bordes) ok(`borde: ${n}`, JSON.stringify(got) === JSON.stringify(esperado), JSON.stringify(got));

// El domingo es el que más se rompe: getDay() lo numera 0.
const dom = evtFechasDe({ dias_semana: ['D'], semanas: [1] }, fase);
ok('domingo de la semana 1 = 11-oct (CRM)', dom[0] === '2026-10-11', `(${dom[0]})`);
const domApi = Object.keys(expandirEventos([{ id: 'x', fase_id: fase.id, dias_semana: ['D'], semanas: [1], visible_cliente: null }], fase));
ok('domingo de la semana 1 = 11-oct (API)', domApi[0] === '2026-10-11', `(${domApi[0]})`);

console.log('--- el candado de publicación ---');
const ocultos = expandirEventos(
  [{ id: 'a', fecha: '2026-10-20', visible_cliente: false },
   { id: 'b', fecha: '2026-10-21', visible_cliente: null }],
  { ...fase, visible_cliente: false });
ok('fase sin enviar → el API no devuelve ningún evento', Object.keys(ocultos).length === 0, JSON.stringify(ocultos));
const forzado = expandirEventos([{ id: 'c', fecha: '2026-10-22', visible_cliente: true }], { ...fase, visible_cliente: false });
ok('evento marcado "sí" se ve aunque la fase no esté enviada', Object.keys(forzado).length === 1);

console.log(fallos ? `\n${fallos} FALLOS` : '\nlas tres implementaciones calzan');
process.exit(fallos ? 1 : 0);
