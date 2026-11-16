// Un registro por día en el calendario del CRM (evtPorFecha, eventos.js):
// las fotos del fin de ciclo («auto») y las del coach el mismo día salen una
// vez; peso y medición el mismo día, solo la medición. Igual que en la app.
//   node pruebas/un-registro-por-dia.mjs
import { readFileSync } from 'fs';
import vm from 'vm';
const raiz = import.meta.dirname + '/..';
const trozo = (ruta, desde, hasta) => { const s = readFileSync(ruta, 'utf8'); const i = s.indexOf(desde), j = s.indexOf(hasta, i); if (i < 0 || j < 0) throw new Error('no encuentro el trozo de ' + ruta); return s.slice(i, j); };
const ctx = vm.createContext({ console });
vm.runInContext(trozo(`${raiz}/entrenamiento.js`, '// ---------- Fechas, en local ----------', '// En qué semana de la fase estamos hoy')
  + trozo(`${raiz}/eventos.js`, '// Días quitados a mano de un evento que se repite', '// =====================================================\n// CAPA DE DATOS')
  + '\nglobalThis.evtPorFecha = evtPorFecha;', ctx);
let mal = 0; const ok = (n, c, x = '') => { if (!c) mal++; console.log(`  ${c ? 'ok ' : 'MAL'}  ${n}${c ? '' : '  ' + x}`); };
const F = '2026-11-09';
const fase = { id: 'f1', fecha_inicio: '2026-10-19', semanas: 4 };
const evs = [
  { id: 'auto-f', tipo: 'fotos', titulo: 'Registro fotográfico', fecha: F, auto: 'cierre_fotos' },
  { id: 'auto-c', tipo: 'medidas', titulo: 'Actualizar composición corporal', fecha: F, auto: 'cierre_composicion' },
  { id: 'coach-f', tipo: 'fotos', titulo: 'Registro fotográfico', fase_id: 'f1', dias_semana: ['L'] },
  { id: 'coach-p', tipo: 'peso', titulo: 'Pesarse', fase_id: 'f1', dias_semana: ['L'] },
  { id: 'cardio', tipo: 'actividad', titulo: 'Cardio después de entrenar', fecha: F },
];
const m = ctx.evtPorFecha(evs, { f1: fase });
const ids = (f) => (m[f] || []).map(e => e.id).sort().join(',');
ok('el último lunes del ciclo: una foto (la del fin de ciclo), la medición y el cardio', ids(F) === 'auto-c,auto-f,cardio', ids(F));
ok('los otros lunes: sus fotos y su peso, como siempre', ids('2026-10-26') === 'coach-f,coach-p', ids('2026-10-26'));
console.log(mal ? `${mal} MAL` : 'todo bien'); process.exit(mal ? 1 : 0);
