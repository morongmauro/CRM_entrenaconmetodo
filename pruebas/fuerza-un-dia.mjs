// La fuerza de UN solo día: el CRM y la app tienen que decir la misma rutina
// cada fecha, con lo que movió o añadió el cliente y lo que cambió el coach
// (movimientos, puestas y quitados, en el orden en que pasaron).
//   · entRutinaPorFechaDia() — CRM (entreno-dias.js), pinta el calendario
//   · rutinaPorFecha()       — app (mealtracker/api/_entreno.js)
//
//   node pruebas/fuerza-un-dia.mjs
import { readFileSync } from 'fs';
import vm from 'vm';

const raiz = import.meta.dirname + '/..';
function trozo(ruta, desde, hasta) {
  const src = readFileSync(ruta, 'utf8');
  const i = src.indexOf(desde), j = src.indexOf(hasta, i);
  if (i < 0 || j < 0) throw new Error(`no encuentro el trozo de ${ruta} — ¿lo moviste?`);
  return src.slice(i, j);
}
const ctx = vm.createContext({ console });
vm.runInContext(
  trozo(`${raiz}/entrenamiento.js`, '// ---------- Fechas, en local ----------', '// En qué semana de la fase estamos hoy')
  + trozo(`${raiz}/entreno-dias.js`, '// ── La regla: qué rutina cae cada fecha', '// El plan semanal como')
  + '\nglobalThis.crm = entRutinaPorFechaDia;', ctx);
const { rutinaPorFecha } = await import(`${raiz}/../mealtracker/api/_entreno.js`);

let mal = 0, n = 0;
const ok = (nombre, c, extra = '') => { n++; if (!c) mal++; console.log(`  ${c ? 'ok ' : 'MAL'}  ${nombre}${c ? '' : '  ' + extra}`); };

const R = ['Push', 'Pull', 'Lower', 'Upper'].map((nombre, i) => ({ id: 'r' + i, nombre }));
const fase = { fecha_inicio: '2026-09-07', semanas: 5 };
const porDia = { L: R[0], M: R[2], X: null, J: R[1], V: R[2], S: null, D: null };
const sumar = (f, d) => { const t = new Date(Date.parse(f + 'T00:00:00Z')); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };
const todas = Array.from({ length: 40 }, (_, i) => sumar('2026-09-05', i));

// Un caso a mano, con lo que debería salir.
{
  const movs = [{ rutina_id: 'r1', desde: '2026-09-10', hasta: '2026-09-09', origen: 'coach', created_at: '2026-09-01T01' }];
  const quit = [{ fecha: '2026-09-11', created_at: '2026-09-01T02' }];
  const ext = [{ fecha: '2026-09-12', rutina: R[3], origen: 'coach' }, { fecha: '2026-09-13', rutina: R[0], origen: 'cliente' }];
  const a = rutinaPorFecha(fase, porDia, movs, ext, quit), c = ctx.crm(fase, porDia, movs, ext, quit);
  ok('a mano: Pull pasó del jueves 10 al miércoles 9', a('2026-09-09')?.nombre === 'Pull' && !a('2026-09-10') && c('2026-09-09')?.nombre === 'Pull' && !c('2026-09-10'));
  ok('a mano: el viernes 11 sin fuerza, el 18 sí', !a('2026-09-11') && !c('2026-09-11') && a('2026-09-18')?.nombre === 'Lower' && c('2026-09-18')?.nombre === 'Lower');
  ok('a mano: el sábado 12 Upper (del coach), el domingo 13 Push (del cliente)', a('2026-09-12')?.nombre === 'Upper' && c('2026-09-12')?.nombre === 'Upper' && a.extraDelCliente('2026-09-13') && !a.extraDelCliente('2026-09-12'));
  ok('a mano: lo del coach no sale como «la moviste» en la app; el CRM sabe quién fue', !a.movida('2026-09-09') && c.quien('2026-09-09') === 'coach' && c.quien('2026-09-13') === 'cliente' && c.quien('2026-09-14') === null);
}

// Al azar: muchos cambios, las dos tienen que coincidir en cada fecha.
let semilla = 7;
const azar = (k) => { semilla = (semilla * 16807) % 2147483647; return semilla % k; };
let iguales = true, detalle = '';
for (let caso = 0; caso < 400 && iguales; caso++) {
  const movs = [], quit = [], ext = [];
  const m = azar(8);
  for (let i = 0; i < m; i++) {
    const t = `2026-09-01T${String(10 + azar(40)).padStart(2, '0')}`;
    const tipo = azar(3);
    if (tipo === 0) movs.push({ rutina_id: 'r' + azar(4), desde: todas[azar(40)], hasta: todas[azar(40)], origen: azar(2) ? 'coach' : 'cliente', created_at: t });
    else if (tipo === 1) quit.push({ fecha: todas[azar(40)], created_at: t });
    else ext.push({ fecha: todas[azar(40)], rutina: R[azar(4)], origen: azar(2) ? 'coach' : 'cliente' });
  }
  const a = rutinaPorFecha(fase, porDia, movs, ext, quit), c = ctx.crm(fase, porDia, movs, ext, quit);
  for (const f of todas) {
    const x = [a(f)?.id || null, a.movida(f), a.extra(f), a.extraDelCliente(f)];
    const y = [c(f)?.id || null, c.movida(f), c.extra(f), c.extraDelCliente(f)];
    if (JSON.stringify(x) !== JSON.stringify(y)) { iguales = false; detalle = `${f}: app ${JSON.stringify(x)} · crm ${JSON.stringify(y)}`; break; }
  }
}
ok('400 casos al azar: el CRM y la app dicen la misma rutina cada día', iguales, detalle);

console.log(mal ? `\n${mal} fallo(s)` : `\n${n}/${n} bien`);
process.exit(mal ? 1 : 0);
